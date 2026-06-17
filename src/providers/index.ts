import type { ProviderId } from "../config.js";
import type { SearchSourceProvider } from "./types.js";
import { BraveProvider } from "./brave.js";
import { ExaProvider } from "./exa.js";
import { TavilyProvider } from "./tavily.js";
import { XaiProvider } from "./xai.js";

export function createProviders(): Map<ProviderId, SearchSourceProvider> {
  return new Map<ProviderId, SearchSourceProvider>([
    ["exa", new ExaProvider()],
    ["tavily", new TavilyProvider()],
    ["grok", new XaiProvider()],
    ["brave", new BraveProvider()],
  ]);
}
