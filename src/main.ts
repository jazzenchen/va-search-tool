#!/usr/bin/env node
import { runHttp } from "./http.js";
import { runStdio } from "./rpc.js";
import { SearchProvider } from "./search-provider.js";

const [, , command = "stdio", ...args] = process.argv;

try {
  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
  } else if (command.startsWith("-")) {
    await runOneShot([command, ...args]);
  } else switch (command) {
    case "stdio":
      await runStdio();
      break;
    case "serve":
      await runHttp(option(args, "--host") ?? "127.0.0.1", Number(option(args, "--port") ?? 8787));
      break;
    case "search":
      await runOneShot(args);
      break;
    default:
      throw new Error(`unknown command '${command}'`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function runOneShot(args: string[]): Promise<void> {
  applyCliKeyOverrides(args);
  const query = option(args, "--search", "-search") ?? args.find((arg) => !arg.startsWith("-"));
  if (!query) throw new Error("search query is required");
  const maxResults = option(args, "--max-results", "-max_results", "-maxResults");
  const providers = values(args, "--provider", "--source", "-provider", "-source");
  const includeDomains = values(args, "--include-domain", "-include_domain");
  const excludeDomains = values(args, "--exclude-domain", "-exclude_domain");
  const searchContextSize = option(args, "--search-context-size", "-search_context_size");
  const response = await new SearchProvider().search({
    query,
    maxResults: maxResults ? Number(maxResults) : undefined,
    providers,
    includeDomains,
    excludeDomains,
    searchContextSize,
  });
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
}

function applyCliKeyOverrides(args: string[]): void {
  const mappings: Array<[string, string[], string]> = [
    ["VA_SEARCH_EXA_API_KEY", ["--exa-key", "-exa_key"], "exa"],
    ["VA_SEARCH_TAVILY_API_KEY", ["--tavily-key", "--travily-key", "-tavily_key", "-travily_key"], "tavily"],
    ["VA_SEARCH_GROK_API_KEY", ["--xai-key", "--grok-key", "-xai_key", "-grok_key"], "grok"],
    ["VA_SEARCH_BRAVE_API_KEY", ["--brave-key", "-brave_key"], "brave"],
  ];
  const enabled: string[] = [];
  for (const [envKey, flags, provider] of mappings) {
    const value = option(args, ...flags);
    if (!value) continue;
    process.env[envKey] = value;
    process.env[`VA_SEARCH_${provider.toUpperCase()}_ENABLED`] = "true";
    enabled.push(provider);
  }
  if (enabled.length > 0 && !process.env.VA_SEARCH_SOURCES) {
    process.env.VA_SEARCH_SOURCES = enabled.join(",");
  }
}

function option(args: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("-")) return args[index + 1];
  }
  return undefined;
}

function values(args: string[], ...names: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (names.includes(args[index] ?? "") && args[index + 1] && !args[index + 1].startsWith("-")) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

function printHelp(): void {
  process.stdout.write(`va-search-tool

Commands:
  stdio                         Run JSON-RPC 2.0 over stdio
  serve [--host H] [--port P]    Run local HTTP endpoints
  search <query> [options]       Run one search and print JSON
  --search <query> [options]     Run one search without a subcommand

Options for search:
  --max-results <n>
  --provider <exa|tavily|grok|brave>
  --exa-key <key>
  --tavily-key <key>
  --xai-key <key>
  --brave-key <key>
  --include-domain <domain>
  --exclude-domain <domain>
  --search-context-size <low|medium|high>
`);
}
