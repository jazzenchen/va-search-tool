import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_ORDER,
  type ProviderId,
  type SearchToolConfig,
} from "./config.js";
import type { SearchSourceProvider } from "./providers/types.js";
import { SearchProvider } from "./search-provider.js";
import type { WebSearchResponse } from "./types.js";

test("returns successful providers when another provider reaches the total deadline", async () => {
  let hangingSignal: AbortSignal | undefined;
  const providers = providerMap(
    fakeProvider("exa", async (request) => response("exa", request.query)),
    fakeProvider("brave", async (_request, context) => {
      hangingSignal = context.signal;
      return new Promise<WebSearchResponse>(() => undefined);
    }),
  );
  const provider = new SearchProvider(config(["exa", "brave"], 30), providers);

  const startedAt = Date.now();
  const result = await provider.search({ query: "deadline", providers: ["exa", "brave"] });

  assert.equal(result.provider, "exa");
  assert.equal(hangingSignal?.aborted, true);
  assert.ok(Date.now() - startedAt < 500, "search should finish at its configured deadline");
});

test("fails within the total deadline when every provider hangs", async () => {
  const providers = providerMap(
    fakeProvider("exa", async () => new Promise<WebSearchResponse>(() => undefined)),
  );
  const provider = new SearchProvider(config(["exa"], 30), providers);

  await assert.rejects(
    provider.search({ query: "deadline" }),
    /all search providers failed: exa: search deadline exceeded after 30ms/,
  );
});

test("validates, canonicalizes, and deduplicates requested provider ids", async () => {
  let calls = 0;
  const providers = providerMap(
    fakeProvider("grok", async (request) => {
      calls += 1;
      return response("grok", request.query);
    }),
  );
  const provider = new SearchProvider(config(["grok"], 100), providers);

  const result = await provider.search({ query: "aliases", providers: ["xai", "grok"] });
  assert.equal(result.provider, "grok");
  assert.equal(calls, 1);

  await assert.rejects(
    provider.search({ query: "invalid", providers: ["unknown"] }),
    /unsupported search provider 'unknown'/,
  );
  await assert.rejects(
    provider.search({ query: "unbounded", providers: ["exa", "exa", "exa", "exa", "exa"] }),
    /at most 4 providers may be requested/,
  );
});

function config(defaultProviders: ProviderId[], searchTimeoutMs: number): SearchToolConfig {
  return {
    sources: new Map(PROVIDER_ORDER.map((id) => [id, { id, enabled: true, apiKey: "test" }])),
    defaultProviders,
    maxResults: 5,
    searchTimeoutMs,
    grokModel: "test",
  };
}

function providerMap(...providers: SearchSourceProvider[]): Map<ProviderId, SearchSourceProvider> {
  return new Map(providers.map((provider) => [provider.id, provider]));
}

function fakeProvider(
  id: ProviderId,
  search: SearchSourceProvider["search"],
): SearchSourceProvider {
  return { id, search };
}

function response(provider: ProviderId, query: string): WebSearchResponse {
  return { provider, query, results: [], citations: [] };
}
