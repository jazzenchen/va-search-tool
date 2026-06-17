import OpenAI from "openai";

import { firstNonEmptyLine, resultFromParts, stringField, titleFromUrl } from "../normalize.js";
import type { WebSearchRequest, WebSearchResponse } from "../types.js";
import type { ProviderSearchContext, SearchSourceProvider } from "./types.js";

const XAI_DEFAULT_BASE_URL = "https://api.x.ai/v1";

interface XaiCitation {
  url: string;
  title?: string;
}

export class XaiProvider implements SearchSourceProvider {
  readonly id = "grok" as const;

  async search(
    request: WebSearchRequest,
    context: ProviderSearchContext,
  ): Promise<WebSearchResponse> {
    const apiKey = context.source.apiKey;
    if (!apiKey) throw new Error("xAI api key is not configured");

    const client = new OpenAI({
      apiKey,
      baseURL: context.source.baseUrl ?? XAI_DEFAULT_BASE_URL,
    });
    const tool: Record<string, unknown> = { type: "web_search" };
    const filters = domainFilters(request);
    if (filters) tool.filters = filters;

    const response = await client.responses.create({
      model: context.config.grokModel,
      include: ["no_inline_citations"],
      input: [
        {
          role: "user",
          content: `Search the web for: ${request.query}\nReturn a concise answer grounded in up to ${context.maxResults} relevant sources.`,
        },
      ],
      tools: [tool],
    } as never);

    return normalizeXaiResponse(request.query, context.maxResults, response);
  }
}

function normalizeXaiResponse(
  query: string,
  maxResults: number,
  response: unknown,
): WebSearchResponse {
  const answer = outputText(response);
  const citations = collectCitations(response);
  const results = citations.slice(0, maxResults).map((citation) =>
    resultFromParts({
      title: citation.title ?? titleFromUrl(citation.url),
      url: citation.url,
      snippet: firstNonEmptyLine(answer) ?? "Grok web search result",
      content: answer,
      source: "grok",
    }),
  );

  return {
    provider: "grok",
    query,
    results,
    citations: results.map((result) => result.url),
  };
}

function outputText(response: unknown): string {
  const output = Array.isArray((response as { output?: unknown }).output)
    ? ((response as { output?: unknown[] }).output ?? [])
    : [];
  const parts: string[] = [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content?: unknown[] }).content ?? [])
      : [];
    for (const block of content) {
      const text = stringField((block as { text?: unknown }).text);
      const type = stringField((block as { type?: unknown }).type);
      if (text && (!type || type === "output_text")) parts.push(text);
    }
  }
  return parts.join("\n\n");
}

function collectCitations(response: unknown): XaiCitation[] {
  const citations: XaiCitation[] = [];
  const add = (citation: XaiCitation) => {
    if (!citation.url || citations.some((item) => item.url === citation.url)) return;
    citations.push(citation);
  };

  for (const url of arrayOfStrings((response as { citations?: unknown }).citations)) {
    add({ url });
  }

  const output = Array.isArray((response as { output?: unknown }).output)
    ? ((response as { output?: unknown[] }).output ?? [])
    : [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content?: unknown[] }).content ?? [])
      : [];
    for (const block of content) {
      const annotations = Array.isArray((block as { annotations?: unknown }).annotations)
        ? ((block as { annotations?: unknown[] }).annotations ?? [])
        : [];
      for (const annotation of annotations) {
        const url = stringField((annotation as { url?: unknown }).url);
        if (url) add({ url, title: stringField((annotation as { title?: unknown }).title) });
      }
    }
  }

  return citations;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function domainFilters(request: WebSearchRequest): Record<string, unknown> | undefined {
  if (request.includeDomains?.length) {
    return { allowed_domains: trimmedDomains(request.includeDomains, 5) };
  }
  if (request.excludeDomains?.length) {
    return { excluded_domains: trimmedDomains(request.excludeDomains, 5) };
  }
  return undefined;
}

function trimmedDomains(values: string[], limit: number): string[] {
  return values.map((value) => value.trim()).filter(Boolean).slice(0, limit);
}
