import {
  compactWhitespace,
  resultFromParts,
  stringArrayField,
  stringField,
  numberField,
} from "../normalize.js";
import type { WebSearchRequest, WebSearchResponse } from "../types.js";
import type { ProviderSearchContext, SearchSourceProvider } from "./types.js";

const EXA_DEFAULT_BASE_URL = "https://api.exa.ai";

interface ExaResult {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  summary?: unknown;
  highlights?: unknown;
  score?: unknown;
  publishedDate?: unknown;
  published_date?: unknown;
}

export class ExaProvider implements SearchSourceProvider {
  readonly id = "exa" as const;

  async search(
    request: WebSearchRequest,
    context: ProviderSearchContext,
  ): Promise<WebSearchResponse> {
    const apiKey = context.source.apiKey;
    if (!apiKey) throw new Error("exa api key is not configured");

    const response = await fetch(new URL("/search", context.source.baseUrl ?? EXA_DEFAULT_BASE_URL), {
      method: "POST",
      signal: context.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query: request.query,
        type: "auto",
        numResults: context.maxResults,
        includeDomains: request.includeDomains,
        excludeDomains: request.excludeDomains,
        contents:
          context.searchContextSize === "high"
            ? { text: true, highlights: true }
            : { highlights: true },
      }),
    });
    if (!response.ok) {
      throw new Error(`exa returned ${response.status}: ${compactWhitespace(await response.text())}`);
    }
    const body = (await response.json()) as { results?: ExaResult[] };

    const results = (body.results ?? [])
      .map((item) => normalizeExaResult(item))
      .filter((item): item is NonNullable<ReturnType<typeof normalizeExaResult>> => !!item);

    return {
      provider: "exa",
      query: request.query,
      results,
      citations: results.map((result) => result.url),
    };
  }
}

function normalizeExaResult(result: ExaResult) {
  const url = stringField(result.url);
  if (!url) return undefined;
  const highlights = stringArrayField(result.highlights);
  const content =
    stringField(result.text) ??
    stringField(result.summary) ??
    (highlights.length > 0 ? highlights.join("\n") : "");

  return resultFromParts({
    title: stringField(result.title),
    url,
    content,
    score: numberField(result.score),
    publishedDate: stringField(result.publishedDate) ?? stringField(result.published_date),
    source: "exa",
  });
}
