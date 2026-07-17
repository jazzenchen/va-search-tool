import {
  clampMaxResults,
  loadConfigFromEnv,
  normalizeProviderId,
  PROVIDER_ORDER,
  type ProviderId,
  type SearchToolConfig,
} from "./config.js";
import { createProviders } from "./providers/index.js";
import type { SearchSourceProvider } from "./providers/types.js";
import { SearchError, type SearchContextSize, type WebSearchRequest, type WebSearchResponse } from "./types.js";

export class SearchProvider {
  private readonly providers: Map<ProviderId, SearchSourceProvider>;

  constructor(
    private readonly config: SearchToolConfig = loadConfigFromEnv(),
    providers: Map<ProviderId, SearchSourceProvider> = createProviders(),
  ) {
    this.providers = providers;
  }

  async search(rawRequest: unknown): Promise<WebSearchResponse> {
    const request = normalizeRequest(rawRequest);
    if (!request.query) throw new SearchError("web search query must not be empty");

    const providerIds = selectedProviders(request, this.config.defaultProviders);
    if (providerIds.length === 0) {
      throw new SearchError("no search providers configured; enable Exa, Tavily, Grok, or Brave with an API key");
    }

    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new Error(`search deadline exceeded after ${this.config.searchTimeoutMs}ms`)),
      this.config.searchTimeoutMs,
    );

    try {
      const responses = await Promise.all(
        providerIds.map(async (providerId) => {
          const provider = this.providers.get(providerId);
          const source = this.config.sources.get(providerId);
          if (!provider || !source) {
            return { providerId, error: new Error(`unsupported search provider '${providerId}'`) };
          }
          try {
            const maxResults = clampMaxResults(request.maxResults ?? this.config.maxResults);
            const searchContextSize = request.searchContextSize ?? this.config.searchContextSize;
            return {
              providerId,
              response: await waitForAbort(
                provider.search(request, {
                  source,
                  config: this.config,
                  maxResults,
                  signal: deadline.signal,
                  searchContextSize,
                }),
                deadline.signal,
              ),
            };
          } catch (error) {
            return {
              providerId,
              error: error instanceof Error ? error : new Error(String(error)),
            };
          }
        }),
      );

      const successes = responses.flatMap((item) => (item.response ? [item.response] : []));
      if (successes.length === 0) {
        const errors = responses
          .map((item) => `${item.providerId}: ${item.error?.message ?? "unknown error"}`)
          .join("; ");
        throw new SearchError(`all search providers failed: ${errors}`);
      }

      return combineResponses(request.query, successes);
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeRequest(value: unknown): WebSearchRequest {
  const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    query: stringValue(object.query),
    maxResults: numberValue(object.maxResults ?? object.max_results ?? object.numResults ?? object.num_results),
    includeDomains: stringArrayValue(
      object.includeDomains ?? object.include_domains ?? object.allowedDomains ?? object.allowed_domains,
    ),
    excludeDomains: stringArrayValue(object.excludeDomains ?? object.exclude_domains),
    searchContextSize: searchContextSizeValue(
      object.searchContextSize ?? object.search_context_size,
    ),
    providers: providerListValue(object.providers),
  };
}

function selectedProviders(
  request: WebSearchRequest,
  defaultProviders: ProviderId[],
): ProviderId[] {
  const requested = (request.providers ?? []).map((provider) => provider as ProviderId);
  return requested.length > 0 ? requested : defaultProviders;
}

function providerListValue(value: unknown): ProviderId[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new SearchError("providers must be an array");
  if (value.length > PROVIDER_ORDER.length) {
    throw new SearchError(`at most ${PROVIDER_ORDER.length} providers may be requested`);
  }

  const providers: ProviderId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      throw new SearchError("provider ids must be non-empty strings");
    }
    const provider = normalizeProviderId(item);
    if (!provider) throw new SearchError(`unsupported search provider '${item.trim()}'`);
    if (!providers.includes(provider)) providers.push(provider);
  }
  return providers;
}

function waitForAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("search aborted");
}

function combineResponses(query: string, responses: WebSearchResponse[]): WebSearchResponse {
  return {
    provider: responses.map((response) => response.provider).join(","),
    query,
    results: responses.flatMap((response) => response.results),
    citations: responses.flatMap((response) => response.citations),
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function searchContextSizeValue(value: unknown): SearchContextSize | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}
