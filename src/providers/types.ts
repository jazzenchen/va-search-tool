import type { ProviderId, SearchToolConfig, SourceConfig } from "../config.js";
import type { SearchContextSize, WebSearchRequest, WebSearchResponse } from "../types.js";

export interface ProviderSearchContext {
  source: SourceConfig;
  config: SearchToolConfig;
  maxResults: number;
  searchContextSize?: SearchContextSize;
}

export interface SearchSourceProvider {
  id: ProviderId;
  search(request: WebSearchRequest, context: ProviderSearchContext): Promise<WebSearchResponse>;
}
