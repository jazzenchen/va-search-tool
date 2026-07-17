import { tavily } from "@tavily/core";

import { resultFromParts, stringField, numberField } from "../normalize.js";
import type { WebSearchRequest, WebSearchResponse } from "../types.js";
import type { ProviderSearchContext, SearchSourceProvider } from "./types.js";

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

    const client = tavily({ apiKey });
    const response = await client.search(request.query, {
      maxResults: context.maxResults,
      searchDepth:
        context.searchContextSize === "high" || context.searchContextSize === "medium"
          ? "advanced"
          : "basic",
      includeAnswer: false,
      includeRawContent: context.searchContextSize === "high",
      includeDomains: request.includeDomains,
      excludeDomains: request.excludeDomains,
      timeout: Math.max(1, Math.ceil(context.timeoutMs / 1_000)),
    } as never);

    const results = ((response as { results?: TavilyResult[] }).results ?? [])
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
