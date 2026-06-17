import { compactWhitespace, resultFromParts, stringField } from "../normalize.js";
import type { WebSearchRequest, WebSearchResponse } from "../types.js";
import type { ProviderSearchContext, SearchSourceProvider } from "./types.js";

const BRAVE_DEFAULT_BASE_URL = "https://api.search.brave.com";

interface BraveResult {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  extra_snippets?: unknown;
  age?: unknown;
}

export class BraveProvider implements SearchSourceProvider {
  readonly id = "brave" as const;

  async search(
    request: WebSearchRequest,
    context: ProviderSearchContext,
  ): Promise<WebSearchResponse> {
    const apiKey = context.source.apiKey;
    if (!apiKey) throw new Error("brave api key is not configured");

    const url = new URL("/res/v1/web/search", context.source.baseUrl ?? BRAVE_DEFAULT_BASE_URL);
    url.searchParams.set("q", request.query);
    url.searchParams.set("count", String(context.maxResults));
    if (request.includeDomains?.length) {
      url.searchParams.set("site", request.includeDomains.slice(0, 5).join(","));
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    });
    if (!response.ok) {
      throw new Error(`brave returned ${response.status}: ${compactWhitespace(await response.text())}`);
    }

    const body = (await response.json()) as { web?: { results?: BraveResult[] } };
    const excluded = new Set((request.excludeDomains ?? []).map((domain) => domain.toLowerCase()));
    const results = (body.web?.results ?? [])
      .filter((item) => !isExcluded(stringField(item.url), excluded))
      .map((item) => normalizeBraveResult(item))
      .filter((item): item is NonNullable<ReturnType<typeof normalizeBraveResult>> => !!item)
      .slice(0, context.maxResults);

    return {
      provider: "brave",
      query: request.query,
      results,
      citations: results.map((result) => result.url),
    };
  }
}

function normalizeBraveResult(result: BraveResult) {
  const url = stringField(result.url);
  if (!url) return undefined;
  const extraSnippets = Array.isArray(result.extra_snippets)
    ? result.extra_snippets.filter((item): item is string => typeof item === "string")
    : [];
  const description = stringField(result.description) ?? "";
  const content = [description, ...extraSnippets].filter(Boolean).join("\n");

  return resultFromParts({
    title: stringField(result.title),
    url,
    content,
    publishedDate: stringField(result.age),
    source: "brave",
  });
}

function isExcluded(url: string | undefined, excludedDomains: Set<string>): boolean {
  if (!url || excludedDomains.size === 0) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return [...excludedDomains].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
