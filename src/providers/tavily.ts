import { compactWhitespace, resultFromParts, stringField, numberField } from "../normalize.js";
import type { WebSearchRequest, WebSearchResponse } from "../types.js";
import type { ProviderSearchContext, SearchSourceProvider } from "./types.js";

const TAVILY_DEFAULT_BASE_URL = "https://api.tavily.com";

interface TavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  rawContent?: unknown;
  raw_content?: unknown;
  score?: unknown;
  publishedDate?: unknown;
  published_date?: unknown;
}

export class TavilyProvider implements SearchSourceProvider {
  readonly id = "tavily" as const;

  async search(
    request: WebSearchRequest,
    context: ProviderSearchContext,
  ): Promise<WebSearchResponse> {
    const apiKey = context.source.apiKey;
    if (!apiKey) throw new Error("tavily api key is not configured");

    const response = await fetch(new URL("/search", context.source.baseUrl ?? TAVILY_DEFAULT_BASE_URL), {
      method: "POST",
      signal: context.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: request.query,
        max_results: context.maxResults,
        search_depth:
          context.searchContextSize === "high" || context.searchContextSize === "medium"
            ? "advanced"
            : "basic",
        include_answer: false,
        include_raw_content: context.searchContextSize === "high",
        include_domains: request.includeDomains,
        exclude_domains: request.excludeDomains,
      }),
    });
    if (!response.ok) {
      throw new Error(`tavily returned ${response.status}: ${compactWhitespace(await response.text())}`);
    }
    const body = (await response.json()) as { results?: TavilyResult[] };

    const results = (body.results ?? [])
      .map((item) => normalizeTavilyResult(item))
      .filter((item): item is NonNullable<ReturnType<typeof normalizeTavilyResult>> => !!item);

    return {
      provider: "tavily",
      query: request.query,
      results,
      citations: results.map((result) => result.url),
    };
  }
}

function normalizeTavilyResult(result: TavilyResult) {
  const url = stringField(result.url);
  if (!url) return undefined;
  const content =
    stringField(result.rawContent) ?? stringField(result.raw_content) ?? stringField(result.content) ?? "";

  return resultFromParts({
    title: stringField(result.title),
    url,
    content,
    score: numberField(result.score),
    publishedDate: stringField(result.publishedDate) ?? stringField(result.published_date),
    source: "tavily",
  });
}
