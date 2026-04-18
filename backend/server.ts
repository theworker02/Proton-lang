#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  analyzeSource,
  BackendRequestError,
  buildSource,
  checkSource,
  formatBackendFailure,
  inspectBackendSource,
  listExamples,
  runSource,
  type BackendContext,
  type SourceRequest,
} from "./service.ts";

interface BackendServerOptions extends BackendContext {
  host?: string;
  port?: number;
}

export function createBackendServer(options: BackendServerOptions = {}): http.Server {
  const rootDir = options.rootDir ?? path.resolve(process.cwd());
  return http.createServer(async (request, response) => {
    try {
      setCommonHeaders(response);
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (request.method === "GET" && url.pathname === "/") {
        sendJson(response, 200, {
          ok: true,
          service: "proton-backend",
          endpoints: [
            "GET /health",
            "GET /api/examples",
            "POST /api/check",
            "POST /api/build",
            "POST /api/inspect",
            "POST /api/analyze",
            "POST /api/run",
          ],
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: "proton-backend", status: "healthy" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/examples") {
        const examples = await listExamples({ rootDir });
        sendJson(response, 200, { ok: true, examples });
        return;
      }

      if (request.method === "POST") {
        const payload = await readJsonBody(request);
        const sourceRequest = payload as SourceRequest;

        if (url.pathname === "/api/check") {
          sendJson(response, 200, { ok: true, result: await checkSource(sourceRequest, { rootDir }) });
          return;
        }
        if (url.pathname === "/api/build") {
          sendJson(response, 200, { ok: true, result: await buildSource(sourceRequest, { rootDir }) });
          return;
        }
        if (url.pathname === "/api/inspect") {
          sendJson(response, 200, { ok: true, result: await inspectBackendSource(sourceRequest, { rootDir }) });
          return;
        }
        if (url.pathname === "/api/analyze") {
          sendJson(response, 200, { ok: true, result: await analyzeSource(sourceRequest, { rootDir }) });
          return;
        }
        if (url.pathname === "/api/run") {
          sendJson(response, 200, { ok: true, result: await runSource(sourceRequest, { rootDir }) });
          return;
        }
      }

      sendJson(response, 404, { ok: false, error: { message: `No backend route for ${request.method} ${url.pathname}.` } });
    } catch (error) {
      const statusCode = error instanceof BackendRequestError ? error.statusCode : 422;
      const sourcePath = extractSourcePathHint(request.url);
      sendJson(response, statusCode, {
        ok: false,
        error: {
          message: formatBackendFailure(sourcePath, error),
        },
      });
    }
  });
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 1024 * 1024) {
      throw new BackendRequestError(413, "Request body exceeds 1MB.");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BackendRequestError(400, "Request body must be valid JSON.");
  }
}

function setCommonHeaders(response: http.ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
}

function sendJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode);
  response.end(JSON.stringify(body, null, 2));
}

function extractSourcePathHint(requestUrl?: string): string {
  if (!requestUrl) {
    return "backend-request";
  }
  return requestUrl.includes("phase") ? requestUrl : "backend-request";
}

async function main(): Promise<void> {
  const host = process.env.PROTON_BACKEND_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.PROTON_BACKEND_PORT ?? "8787", 10);
  const server = createBackendServer({ host, port, rootDir: path.resolve(process.cwd()) });
  await new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      console.log(`proton backend listening on http://${host}:${port}`);
      resolve();
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
