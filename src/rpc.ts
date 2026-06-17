import { createInterface } from "node:readline";

import { SearchProvider } from "./search-provider.js";

interface RpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export async function runStdio(provider = new SearchProvider()): Promise<void> {
  redirectConsoleToStderr();
  const lines = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (!line.trim()) continue;
    const response = await handleRpcLine(provider, line);
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

export async function handleRpc(provider: SearchProvider, request: RpcRequest): Promise<RpcResponse> {
  const id = request.id ?? null;
  if (request.method !== "web_search" && request.method !== "search") {
    return rpcError(id, -32601, `unknown method '${String(request.method)}'`);
  }

  try {
    const result = await provider.search(request.params ?? {});
    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    return rpcError(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function handleRpcLine(provider: SearchProvider, line: string): Promise<RpcResponse> {
  let request: RpcRequest;
  try {
    request = JSON.parse(line) as RpcRequest;
  } catch (error) {
    return rpcError(null, -32700, `invalid JSON-RPC line: ${error instanceof Error ? error.message : String(error)}`);
  }
  return handleRpc(provider, request);
}

function rpcError(id: unknown, code: number, message: string): RpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

function redirectConsoleToStderr(): void {
  const toStderr = (...args: unknown[]) =>
    process.stderr.write(`${args.map(String).join(" ")}\n`);
  console.log = toStderr;
  console.info = toStderr;
  console.warn = (...args: unknown[]) =>
    process.stderr.write(`[warn] ${args.map(String).join(" ")}\n`);
  console.error = (...args: unknown[]) =>
    process.stderr.write(`[error] ${args.map(String).join(" ")}\n`);
  console.debug = (...args: unknown[]) =>
    process.stderr.write(`[debug] ${args.map(String).join(" ")}\n`);
}
