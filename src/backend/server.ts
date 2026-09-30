import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { AutoApplyEngine } from "./auto-apply.js";
import { calculateMarketIntelligence } from "./market-intelligence.js";
import { MarketHistoryStore } from "./market-history.js";

const frontendDir = process.env.DASHBOARD_FRONTEND_DIR
  ? resolve(process.env.DASHBOARD_FRONTEND_DIR)
  : resolve(process.cwd(), "src/frontend");

const QVAPAY_API_BASE_URL = (process.env.QVAPAY_API_BASE_URL ?? "https://api.qvapay.com").replace(/\/$/, "");
const HOST = process.env.DASHBOARD_HOST ?? "127.0.0.1";
const PORT = Number(process.env.DASHBOARD_PORT ?? "8080");

const allowedQueryParameters = new Set([
  "page", "take", "type", "coin", "orderBy", "orderType",
  "min", "max", "ratio_min", "ratio_max", "only_vip", "my", "status"
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
    "User-Agent": "qvapay-ai-scanner-p2p-dashboard/0.4"
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

async function fetchP2POffer(uuid: string): Promise<Response> {
  const endpoint = new URL(`/p2p/${encodeURIComponent(uuid)}`, QVAPAY_API_BASE_URL);

  return fetch(endpoint, {
    method: "GET",
    headers: qvapayHeaders(),
    signal: AbortSignal.timeout(20_000)
  });
}

async function applyP2POffer(uuid: string): Promise<Response> {
  const endpoint = new URL(`/p2p/${encodeURIComponent(uuid)}/apply`, QVAPAY_API_BASE_URL);

  return fetch(endpoint, {
    method: "POST",
    headers: qvapayHeaders(),
    signal: AbortSignal.timeout(20_000)
  });
}

async function readUpstreamPayload(upstream: Response): Promise<unknown> {
  const text = await upstream.text();

  try {
    return JSON.parse(text);
  } catch {
    return text ? { message: text } : {};
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) {
      throw new Error("Cuerpo de solicitud demasiado grande.");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON inválido.");
  }
}

async function handleApiP2P(response: ServerResponse, url: URL): Promise<void> {
  try {
    const upstream = await fetchP2P(url);
    const payload = await readUpstreamPayload(upstream);

    sendJson(response, upstream.status, upstream.ok
      ? payload
      : { error: "QvaPay API error", detail: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("QVAPAY_APP_ID") ? 500 : 502;
    sendJson(response, status, status === 500
      ? { error: message }
      : { error: "No se pudo contactar con QvaPay", detail: message });
  }
}

async function handleApiIntelligence(response: ServerResponse, url: URL): Promise<void> {
  try {
    const upstream = await fetchP2P(url);
    const payload = await readUpstreamPayload(upstream);
    if (!upstream.ok) {
      sendJson(response, upstream.status, { error: "QvaPay API error", detail: payload });
      return;
    }
    const offers = payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data)
      ? (payload as Record<string, unknown>).data as Record<string, unknown>[]
      : [];
    sendJson(response, 200, { intelligence: calculateMarketIntelligence(offers) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, message.includes("QVAPAY_APP_ID") ? 500 : 502, { error: message });
  }
}

async function handleApiP2POffer(response: ServerResponse, uuid: string): Promise<void> {
  if (!uuid || uuid.length > 200) {
    sendJson(response, 400, { error: "Identificador de oferta inválido." });
    return;
  }

  try {
    const upstream = await fetchP2POffer(uuid);
    const payload = await readUpstreamPayload(upstream);

    sendJson(response, upstream.status, upstream.ok
      ? { offer_uuid: uuid, qvapay: payload }
      : { error: "No se pudo consultar la oferta", detail: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("QVAPAY_APP_ID") ? 500 : 502;
    sendJson(response, status, status === 500
      ? { error: message }
      : { error: "No se pudo contactar con QvaPay", detail: message });
  }
}

async function handleApiApplyP2P(response: ServerResponse, uuid: string): Promise<void> {
  if (!uuid || uuid.length > 200) {
    sendJson(response, 400, { error: "Identificador de oferta inválido." });
    return;
  }

  try {
    const upstream = await applyP2POffer(uuid);
    const payload = await readUpstreamPayload(upstream);

    sendJson(response, upstream.status, upstream.ok
      ? { applied: true, offer_uuid: uuid, qvapay: payload }
      : { error: "No se pudo aplicar a la oferta", detail: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("QVAPAY_APP_ID") ? 500 : 502;
    sendJson(response, status, status === 500
      ? { error: message }
      : { error: "No se pudo contactar con QvaPay", detail: message });
  }
}

const marketHistory = new MarketHistoryStore();

async function collectMarketHistory(): Promise<void> {
  try {
    const upstream = await fetchP2P(new URL("/p2p?take=100&orderBy=updated_at&orderType=desc", "http://127.0.0.1"));
    if (!upstream.ok) return;
    const payload = await readUpstreamPayload(upstream);
    const offers = payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data)
      ? (payload as Record<string, unknown>).data as Record<string, unknown>[] : [];
    await marketHistory.append(offers);
  } catch (error) { console.error("Market history collector:", error); }
}

const autoApplyEngine = new AutoApplyEngine({
  fetchMarket: (params) => fetchP2P(new URL("/p2p?" + params.toString(), "http://127.0.0.1")),
  applyOffer: applyP2POffer,
  fetchOwnProcessing: () => fetchP2P(new URL("/p2p?my=1&status=processing&take=100", "http://127.0.0.1")),
  readPayload: readUpstreamPayload,
});

async function handleAutoApplyConfig(response: ServerResponse, method: string, request: IncomingMessage): Promise<void> {
  try {
    if (method === "GET") {
      sendJson(response, 200, { config: autoApplyEngine.getConfig() });
      return;
    }

    const body = await readJsonBody(request);
    const config = await autoApplyEngine.updateConfig(body);
    sendJson(response, 200, { config });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 400, { error: message });
  }
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "p2p-market-dashboard" });
    return;
  }

  if (url.pathname === "/api/auto-apply/config" &&
      (request.method === "GET" || request.method === "PUT" || request.method === "PATCH")) {
    await handleAutoApplyConfig(response, request.method, request);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auto-apply/status") {
    sendJson(response, 200, { status: autoApplyEngine.getStatus() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/history") {
    const coin=url.searchParams.get("coin")??undefined;
    const type=url.searchParams.get("type")??undefined;
    const limit=Number(url.searchParams.get("limit")??"200");
    sendJson(response,200,{history:marketHistory.query(coin,type,Number.isFinite(limit)?limit:200)});
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/intelligence") {
    await handleApiIntelligence(response, url);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/p2p") {
    await handleApiP2P(response, url);
    return;
  }

  if (request.method === "GET") {
    const match = url.pathname.match(/^\/api\/p2p\/([^/]+)$/);
    if (match) {
      const encodedUuid = match[1];
      if (!encodedUuid) {
        sendJson(response, 400, { error: "Identificador de oferta inválido." });
        return;
      }

      let uuid: string;
      try {
        uuid = decodeURIComponent(encodedUuid);
      } catch {
        sendJson(response, 400, { error: "Identificador de oferta inválido." });
        return;
      }

      await handleApiP2POffer(response, uuid);
      return;
    }
  }

  if (request.method === "POST") {
    const match = url.pathname.match(/^\/api\/p2p\/([^/]+)\/apply$/);
    if (match) {
      const encodedUuid = match[1];
      if (!encodedUuid) {
        sendJson(response, 400, { error: "Identificador de oferta inválido." });
        return;
      }

      let uuid: string;
      try {
        uuid = decodeURIComponent(encodedUuid);
      } catch {
        sendJson(response, 400, { error: "Identificador de oferta inválido." });
        return;
      }

      await handleApiApplyP2P(response, uuid);
      return;
    }
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Método no permitido" });
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

void Promise.all([marketHistory.initialize(), autoApplyEngine.initialize()]).then(() => {
  void collectMarketHistory();
  setInterval(() => { void collectMarketHistory(); }, 60_000);
  server.listen(PORT, HOST, () => {
    console.log(`QvaPay P2P Dashboard: http://${HOST}:${PORT}`);
  });
}).catch((error: unknown) => {
  console.error("No se pudo inicializar Auto-Apply:", error);
  process.exitCode = 1;
});