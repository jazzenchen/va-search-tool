export type SearchContextSize = "low" | "medium" | "high";

export interface WebSearchRequest {
  query: string;
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  searchContextSize?: SearchContextSize;
  providers?: string[];
}

export interface WebSearchResponse {
  provider: string;
  query: string;
  results: WebSearchResult[];
  citations: string[];
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content: string;
  score?: number;
  publishedDate?: string;
  source: string;
}

export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchError";
  }
}
