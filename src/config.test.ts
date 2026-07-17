import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SEARCH_TIMEOUT_MS,
  loadConfigFromEnv,
  MAX_SEARCH_TIMEOUT_MS,
  MIN_SEARCH_TIMEOUT_MS,
} from "./config.js";

test("environment provider ids are validated and deduplicated", () => {
  const config = loadConfigFromEnv({
    VA_SEARCH_SOURCES: "exa,xai,grok,brave,exa",
  });

  assert.deepEqual(config.defaultProviders, ["exa", "grok", "brave"]);
  assert.throws(
    () => loadConfigFromEnv({ VA_SEARCH_SOURCES: "exa,unknown" }),
    /unsupported search provider 'unknown' in VA_SEARCH_SOURCES/,
  );
});

test("environment search timeout has deterministic bounds", () => {
  assert.equal(loadConfigFromEnv({}).searchTimeoutMs, DEFAULT_SEARCH_TIMEOUT_MS);
  assert.equal(loadConfigFromEnv({ VA_SEARCH_TIMEOUT_MS: "1" }).searchTimeoutMs, MIN_SEARCH_TIMEOUT_MS);
  assert.equal(
    loadConfigFromEnv({ VA_SEARCH_TIMEOUT_MS: "999999" }).searchTimeoutMs,
    MAX_SEARCH_TIMEOUT_MS,
  );
});
