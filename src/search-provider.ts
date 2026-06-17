import {
  clampMaxResults,
  loadConfigFromEnv,
  normalizeProviderId,
  type ProviderId,
  type SearchToolConfig,
} from "./config.js";
import { createProviders } from "./providers/index.js";
import type { SearchSourceProvider } from "./providers/types.js";
import { SearchError, type SearchContextSize, type WebSearchRequest, type WebSearchResponse } from "./types.js";

export class SearchProvider {
  private readonly providers: Map<ProviderId, SearchSourceProvider>;

  constructor(private readonly config: SearchToolConfig = loadConfigFromEnv()) {
    this.providers = createProviders();
  }

  async search(rawRequest: unknown): Promise<WebSearchResponse> {
    const request = normalizeRequest(rawRequest);
    if (!request.query) throw new SearchError("web search query must not be empty");

    const providerIds = selectedProviders(request, this.config.defaultProviders);
    if (providerIds.length === 0) {
      throw new SearchError("no search providers configured; enable Exa, Tavily, Grok, or Brave with an API key");
    }

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
            response: await provider.search(request, {
              source,
              config: this.config,
              maxResults,
              searchContextSize,
            }),
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
    providers: stringArrayValue(object.providers),
  };
}

function selectedProviders(
  request: WebSearchRequest,
  defaultProviders: ProviderId[],
): ProviderId[] {
  const requested = (request.providers ?? [])
    .map((provider) => normalizeProviderId(provider))
    .filter((provider): provider is ProviderId => !!provider);
  return requested.length > 0 ? requested : defaultProviders;
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
