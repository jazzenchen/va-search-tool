import type { WebSearchResult } from "./types.js";

export function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

export function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function stringArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) {
        return String((item as { text?: unknown }).text ?? "");
      }
      return "";
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resultFromParts(input: {
  title?: string;
  url: string;
  content?: string;
  snippet?: string;
  score?: number;
  publishedDate?: string;
  source: string;
}): WebSearchResult {
  const content = input.content ?? "";
  return {
    title: input.title?.trim() || titleFromUrl(input.url),
    url: input.url,
    snippet: input.snippet?.trim() || firstNonEmptyLine(content) || titleFromUrl(input.url),
    content,
    score: input.score,
    publishedDate: input.publishedDate,
    source: input.source,
  };
}
