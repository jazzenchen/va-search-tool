import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { handleRpc } from "./rpc.js";
import { SearchProvider } from "./search-provider.js";

export async function runHttp(host: string, port: number): Promise<void> {
  const provider = new SearchProvider();
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return sendJson(response, 200, { ok: true, service: "va-search-tool" });
      }
      if (request.method === "POST" && request.url === "/v1/search") {
        const result = await provider.search(await readJson(request));
        return sendJson(response, 200, result);
      }
      if (request.method === "POST" && request.url === "/rpc") {
        const result = await handleRpc(provider, (await readJson(request)) as Parameters<typeof handleRpc>[1]);
        return sendJson(response, 200, result);
      }
      return sendJson(response, 404, { error: { message: "not found" } });
    } catch (error) {
      return sendJson(response, 400, {
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: "search_error",
        },
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  process.stderr.write(`va-search-tool listening on http://${host}:${port}\n`);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : {};
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
