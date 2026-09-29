import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = process.env.DASHBOARD_FRONTEND_DIR
  ? resolve(process.env.DASHBOARD_FRONTEND_DIR)
  : resolve(process.cwd(), "src/frontend");

const QVAPAY_API_BASE_URL = (process.env.QVAPAY_API_BASE_URL ?? "https://api.qvapay.com").replace(/\/$/, "");
const HOST = process.env.DASHBOARD_HOST ?? "127.0.0.1";
const PORT = Number(process.env.DASHBOARD_PORT ?? "8080");

const allowedQueryParameters = new Set([
  "page", "take", "type", "coin", "orderBy", "orderType",
  "min", "max", "ratio_min", "ratio_max", "only_vip"
]);

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    default: return "application/octet-stream";
  }
}

async function sendFile(response: ServerResponse, path: string): Promise<void> {
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": contentType(path),
      "Cache-Control": "no-store",
      "Content-Length": body.byteLength
    });
    response.end(body);
  } catch {
    sendJson(response, 404, { error: "Archivo no encontrado" });
  }
}

function qvapayHeaders(): Record<string, string> {
  const appId = process.env.QVAPAY_APP_ID;
  const appSecret = process.env.QVAPAY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Faltan QVAPAY_APP_ID y QVAPAY_APP_SECRET en las variables de entorno.");
  }

  return {
    Accept: "application/json",
    "app-id": appId,
    "app-secret": appSecret,
    "User-Agent": "qvapay-ai-scanner-p2p-dashboard/0.2"
  };
}

function sanitizeQuery(url: URL): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of url.searchParams) {
    if (allowedQueryParameters.has(key) && value) {
      params.set(key, value);
    }
  }

  const take = Number(params.get("take") ?? "100");
  if (!Number.isFinite(take)) {
    params.set("take", "100");
  } else {
    params.set("take", String(Math.min(Math.max(Math.trunc(take), 1), 100)));
  }

  if (params.get("orderBy") === "best_rate" &&
      (!params.get("type") || !params.get("coin"))) {
    params.set("orderBy", "updated_at");
  }

  return params;
}

async function fetchP2P(url: URL): Promise<Response> {
  const params = sanitizeQuery(url);
  const endpoint = new URL("/p2p", QVAPAY_API_BASE_URL);
  endpoint.search = params.toString();

  return fetch(endpoint, {
    method: "GET",
    headers: qvapayHeaders(),
    signal: AbortSignal.timeout(20_000)
  });
}

async function handleApiP2P(response: ServerResponse, url: URL): Promise<void> {
  try {
    const upstream = await fetchP2P(url);
    const text = await upstream.text();

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }

    sendJson(response, upstream.status, upstream.ok
      ? payload
      : { error: "QvaPay API error", detail: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("QVAPAY_APP_ID") ? 500 : 502;
    sendJson(response, status, {
      error: status === 500 ? message : "No se pudo contactar con QvaPay",
      detail: status === 502 ? message : undefined
    });
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Método no permitido" });
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "p2p-market-dashboard" });
    return;
  }

  if (url.pathname === "/api/p2p") {
    await handleApiP2P(response, url);
    return;
  }

  const staticFiles: Record<string, string> = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js"
  };

  const file = staticFiles[url.pathname];
  if (file) {
    await sendFile(response, resolve(frontendDir, file));
    return;
  }

  sendJson(response, 404, { error: "Ruta no encontrada" });
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, { error: "Error interno", detail: message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`QvaPay P2P Dashboard: http://${HOST}:${PORT}`);
});
