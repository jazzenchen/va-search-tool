import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  PROVIDER_ORDER,
  type ProviderId,
  type SearchToolConfig,
} from "./config.js";
import type { SearchSourceProvider } from "./providers/types.js";
import { runRpcStream } from "./rpc.js";
import { SearchProvider } from "./search-provider.js";
import type { WebSearchResponse } from "./types.js";

test("stdio health is deterministic and invalid requests fail closed", async () => {
  let searchCalls = 0;
  const handler = {
    async search(): Promise<WebSearchResponse> {
      searchCalls += 1;
      return response("exa", "unexpected");
    },
  };
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: Array<{
    id: unknown;
    result?: unknown;
    error?: { code: number; message: string };
  }> = [];
  output.on("data", (chunk) => {
    for (const line of chunk.toString().trim().split("\n")) {
      if (line) lines.push(JSON.parse(line));
    }
  });

  const running = runRpcStream(handler, input, output);
  input.end([
    JSON.stringify({ jsonrpc: "2.0", id: "health", method: "health" }),
    JSON.stringify({ jsonrpc: "2.0", id: "unknown", method: "ready" }),
    "null",
    "{not-json",
  ].join("\n") + "\n");
  await running;

  assert.equal(lines.length, 4);
  assert.deepEqual(lines.find((line) => line.id === "health"), {
    jsonrpc: "2.0",
    id: "health",
    result: { status: "ok" },
  });
  assert.deepEqual(lines.find((line) => line.id === "unknown"), {
    jsonrpc: "2.0",
    id: "unknown",
    error: { code: -32601, message: "unknown method 'ready'" },
  });
  assert.deepEqual(lines.find((line) => line.error?.code === -32600), {
    jsonrpc: "2.0",
    id: null,
    error: { code: -32600, message: "invalid JSON-RPC request" },
  });
  const parseError = lines.find((line) => line.error?.code === -32700);
  assert.equal(parseError?.id, null);
  assert.match(parseError?.error?.message ?? "", /^invalid JSON-RPC line:/);
  assert.equal(searchCalls, 0);
});

test("a hung stdio request does not block a later request", async () => {
  const provider = new SearchProvider(
    config(30),
    providerMap(
      fakeProvider("exa", async () => new Promise<WebSearchResponse>(() => undefined)),
      fakeProvider("brave", async (request) => response("brave", request.query)),
    ),
  );
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: Array<{ id: string; result?: WebSearchResponse; error?: unknown }> = [];
  output.on("data", (chunk) => {
    for (const line of chunk.toString().trim().split("\n")) {
      if (line) lines.push(JSON.parse(line));
    }
  });

  const running = runRpcStream(provider, input, output);
  input.end(
    `${JSON.stringify(request("slow", "exa"))}\n${JSON.stringify(request("fast", "brave"))}\n`,
  );
  await running;

  assert.deepEqual(lines.map((line) => line.id), ["fast", "slow"]);
  assert.equal(lines[0]?.result?.provider, "brave");
  assert.ok(lines[1]?.error);
});

test("stdio enforces its concurrency bound", async () => {
  let active = 0;
  let maximumActive = 0;
  const handler = {
    async search(rawRequest: unknown): Promise<WebSearchResponse> {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      const query = (rawRequest as { query: string }).query;
      return response("exa", query);
    },
  };
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();

  const running = runRpcStream(handler, input, output, 2);
  input.end(
    Array.from({ length: 6 }, (_, index) => JSON.stringify(request(String(index), "exa"))).join("\n") + "\n",
  );
  await running;

  assert.equal(maximumActive, 2);
});

function request(id: string, provider: ProviderId) {
  return {
    jsonrpc: "2.0",
    id,
    method: "web_search",
    params: { query: id, providers: [provider] },
  };
}

function config(searchTimeoutMs: number): SearchToolConfig {
  return {
    sources: new Map(PROVIDER_ORDER.map((id) => [id, { id, enabled: true, apiKey: "test" }])),
    defaultProviders: ["exa"],
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
