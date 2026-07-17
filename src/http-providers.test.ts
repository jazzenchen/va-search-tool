import assert from "node:assert/strict";
import test from "node:test";

import { type ProviderId, type SearchToolConfig } from "./config.js";
import { ExaProvider } from "./providers/exa.js";
import { TavilyProvider } from "./providers/tavily.js";
import type { ProviderSearchContext } from "./providers/types.js";

test("Exa and Tavily requests use the shared deadline signal", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const controller = new AbortController();
  await new ExaProvider().search(
    { query: "exa", includeDomains: ["example.com"] },
    providerContext("exa", controller.signal),
  );
  await new TavilyProvider().search(
    { query: "tavily", excludeDomains: ["example.com"] },
    providerContext("tavily", controller.signal),
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, "https://api.exa.ai/search");
  assert.equal(requests[0]?.init?.signal, controller.signal);
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    query: "exa",
    type: "auto",
    numResults: 5,
    includeDomains: ["example.com"],
    contents: { highlights: true },
  });
  assert.equal(requests[1]?.url, "https://api.tavily.com/search");
  assert.equal(requests[1]?.init?.signal, controller.signal);
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    query: "tavily",
    max_results: 5,
    search_depth: "basic",
    include_answer: false,
    include_raw_content: false,
    exclude_domains: ["example.com"],
  });
});

function providerContext(id: ProviderId, signal: AbortSignal): ProviderSearchContext {
  return {
    source: { id, apiKey: "test-key", enabled: true },
    config: config(),
    maxResults: 5,
    signal,
  };
}

function config(): SearchToolConfig {
  return {
    sources: new Map(),
    defaultProviders: [],
    maxResults: 5,
    searchTimeoutMs: 25_000,
    grokModel: "test",
  };
}
