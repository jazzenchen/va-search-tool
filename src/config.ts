import type { SearchContextSize } from "./types.js";

export const DEFAULT_MAX_RESULTS = 5;
export const MAX_RESULTS_LIMIT = 20;
export const DEFAULT_SEARCH_TIMEOUT_MS = 25_000;
export const MIN_SEARCH_TIMEOUT_MS = 100;
export const MAX_SEARCH_TIMEOUT_MS = 120_000;
export const PROVIDER_ORDER = ["exa", "tavily", "grok", "brave"] as const;
export type ProviderId = (typeof PROVIDER_ORDER)[number];

export interface SourceConfig {
  id: ProviderId;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface SearchToolConfig {
  sources: Map<ProviderId, SourceConfig>;
  defaultProviders: ProviderId[];
  maxResults: number;
  searchTimeoutMs: number;
  searchContextSize?: SearchContextSize;
  grokModel: string;
}

export function loadConfigFromEnv(env = process.env): SearchToolConfig {
  const sources = new Map<ProviderId, SourceConfig>();
  for (const id of PROVIDER_ORDER) {
    const source = loadSourceConfig(id, env);
    sources.set(id, source);
  }

  const explicitProviders = splitProviderList(env.VA_SEARCH_SOURCES);
  const defaultProviders =
    explicitProviders.length > 0
      ? explicitProviders
      : PROVIDER_ORDER.filter((id) => sources.get(id)?.enabled);

  return {
    sources,
    defaultProviders,
    maxResults: clampMaxResults(parsePositiveInt(env.VA_SEARCH_MAX_RESULTS)),
    searchTimeoutMs: clampSearchTimeout(parsePositiveInt(env.VA_SEARCH_TIMEOUT_MS)),
    searchContextSize: parseSearchContextSize(env.VA_SEARCH_CONTEXT_SIZE),
    grokModel: clean(env.VA_SEARCH_GROK_MODEL ?? env.VA_SEARCH_XAI_MODEL) ?? "grok-4.3",
  };
}

export function clampSearchTimeout(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_SEARCH_TIMEOUT_MS;
  return Math.min(MAX_SEARCH_TIMEOUT_MS, Math.max(MIN_SEARCH_TIMEOUT_MS, Math.floor(value)));
}

export function normalizeProviderId(value: string): ProviderId | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "xai") return "grok";
  return (PROVIDER_ORDER as readonly string[]).includes(normalized)
    ? (normalized as ProviderId)
    : undefined;
}

export function clampMaxResults(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_MAX_RESULTS;
  return Math.min(MAX_RESULTS_LIMIT, Math.max(1, Math.floor(value)));
}

function loadSourceConfig(id: ProviderId, env: NodeJS.ProcessEnv): SourceConfig {
  const prefix = providerEnvPrefix(id);
  const apiKey =
    clean(env[`VA_SEARCH_${prefix}_API_KEY`]) ??
    wellKnownApiKeyEnv(id)
      .map((key) => clean(env[key]))
      .find((value): value is string => !!value);
  const explicitEnabled = parseBoolean(env[`VA_SEARCH_${prefix}_ENABLED`]);
  return {
    id,
    apiKey,
    baseUrl: clean(env[`VA_SEARCH_${prefix}_BASE_URL`])?.replace(/\/+$/, ""),
    enabled: explicitEnabled ?? !!apiKey,
  };
}

function splitProviderList(value: string | undefined): ProviderId[] {
  if (!value) return [];
  const providers: ProviderId[] = [];
  for (const item of value.split(",")) {
    const rawProvider = item.trim();
    if (!rawProvider) continue;
    const provider = normalizeProviderId(rawProvider);
    if (!provider) {
      throw new Error(`unsupported search provider '${rawProvider}' in VA_SEARCH_SOURCES`);
    }
    if (!providers.includes(provider)) providers.push(provider);
  }
  return providers;
}

function parseSearchContextSize(value: string | undefined): SearchContextSize | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "low" || normalized === "medium" || normalized === "high"
    ? normalized
    : undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  switch (value?.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return undefined;
  }
}

function providerEnvPrefix(id: ProviderId): string {
  return id.toUpperCase();
}

function wellKnownApiKeyEnv(id: ProviderId): string[] {
  switch (id) {
    case "exa":
      return ["EXA_API_KEY"];
    case "tavily":
      return ["TAVILY_API_KEY"];
    case "grok":
      return ["XAI_API_KEY", "GROK_API_KEY"];
    case "brave":
      return ["BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"];
  }
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
