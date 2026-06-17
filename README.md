# va-search-tool

Node.js search runtime for VibeAround host-side web search.

This package is intentionally not exposed directly to agents. VibeAround runs it as a supervised Node child process and talks to it with line-delimited JSON-RPC 2.0 over stdio when an upstream provider cannot run provider/server-side `web_search` natively.

## Install

```sh
npm install
npm run build
```

The package exposes a `va-search-tool` binary after build.

## Stdio

```sh
va-search-tool stdio
```

Request:

```json
{"jsonrpc":"2.0","id":"req_1","method":"web_search","params":{"query":"VibeAround web search","maxResults":2,"providers":["exa"]}}
```

Response:

```json
{"jsonrpc":"2.0","id":"req_1","result":{"provider":"exa","query":"VibeAround web search","results":[],"citations":[]}}
```

## CLI Smoke Tests

Use environment variables:

```sh
EXA_API_KEY=... va-search-tool search "latest AI search APIs" --provider exa --max-results 3
```

Or pass keys directly for one-shot testing:

```sh
va-search-tool --search "latest AI search APIs" --exa-key ... --provider exa
va-search-tool search "latest AI search APIs" --tavily-key ... --provider tavily
va-search-tool search "latest AI search APIs" --xai-key ... --provider grok
va-search-tool search "latest AI search APIs" --brave-key ... --provider brave
```

Single-dash underscore aliases are accepted for quick manual testing, for example `-exa_key`, `-tavily_key`, `-travily_key`, `-xai_key`, and `-search`.

## HTTP

HTTP mode is for local debugging or remote deployment experiments:

```sh
va-search-tool serve --host 127.0.0.1 --port 8787
```

Endpoints:

- `GET /health`
- `POST /v1/search`
- `POST /rpc`

## Providers

Built-in providers:

- `exa`: Exa official JavaScript SDK (`exa-js`)
- `tavily`: Tavily official JavaScript SDK (`@tavily/core`)
- `grok`: xAI Responses API through the official OpenAI-compatible JavaScript SDK (`openai`)
- `brave`: Brave Search REST API

Environment configuration:

```sh
VA_SEARCH_SOURCES=exa,tavily,grok,brave
VA_SEARCH_EXA_API_KEY=...
VA_SEARCH_TAVILY_API_KEY=...
VA_SEARCH_GROK_API_KEY=...
VA_SEARCH_BRAVE_API_KEY=...
VA_SEARCH_MAX_RESULTS=5
VA_SEARCH_CONTEXT_SIZE=medium
VA_SEARCH_GROK_MODEL=grok-4.3
```

The standard `EXA_API_KEY`, `TAVILY_API_KEY`, `XAI_API_KEY`, `GROK_API_KEY`, `BRAVE_API_KEY`, and `BRAVE_SEARCH_API_KEY` variables are also recognized.

`VA_SEARCH_MAX_RESULTS` is applied per enabled provider and is clamped to `1..20`. `VA_SEARCH_CONTEXT_SIZE` accepts `low`, `medium`, or `high`.

When multiple providers are selected or enabled, the tool searches them in parallel and concatenates successful results in provider order. Results are not deduplicated or reranked.
