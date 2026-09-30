/**
 * @file server.ts
 * @path src/backend/server.ts
 * @description Implements server for QvaPay AI Scanner.
 * @module backend
 * @status active
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { AutoApplyEngine } from "./auto-apply.js";
import { calculateMarketIntelligence } from "./market-intelligence.js";
import { MarketHistoryStore } from "./market-history.js";
import { summarizeTrends } from "./trend-engine.js";
import { calculateBaselines } from "./market-baseline.js";
import { fetchAccountSnapshot } from "./account.js";
import { calculateFinanceSummary } from "./finance.js";
import { FinanceLedgerStore } from "./finance-ledger.js";
import { assertDashboardHostIsSafe } from "./dashboard-security.js";
import { MarketSnapshotService } from "./market-snapshot.js";
import { fetchAllCompletedP2P, reconcileCompletedIds } from "./finance-reconciliation.js";

const frontendDir = process.env.DASHBOARD_FRONTEND_DIR
  ? resolve(process.env.DASHBOARD_FRONTEND_DIR)
  : resolve(process.cwd(), "src/frontend");

const QVAPAY_API_BASE_URL = (process.env.QVAPAY_API_BASE_URL ?? "https://api.qvapay.com").replace(/\/$/, "");
const HOST = process.env.DASHBOARD_HOST ?? "127.0.0.1";
const PORT = Number(process.env.DASHBOARD_PORT ?? "8080");
const marketSnapshot = new MarketSnapshotService();

// The dashboard exposes QvaPay operations. Keep the current trust boundary local-only.
assertDashboardHostIsSafe(HOST);

const allowedQueryParameters = new Set([
  "page", "take", "type", "coin", "orderBy", "orderType",
  "min", "max", "ratio_min", "ratio_max", "only_vip", "my", "status"
]);

/**
 * Implements the sendJson operation for this module.
 * @param response Input used by the operation.
 * @param status Input used by the operation.
 * @param payload Input used by the operation.
 * @returns The operation result.
 */
function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

/**
 * Implements the contentType operation for this module.
 * @param path Input used by the operation.
 * @returns The operation result.
 */
function contentType(path: string): string {
  switch (extname(path)) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    default: return "application/octet-stream";
  }
}

/**
 * Implements the sendFile operation for this module.
 * @param response Input used by the operation.
 * @param path Input used by the operation.
 * @returns The operation result.
 */
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

/**
 * Implements the qvapayHeaders operation for this module.

 * @returns The operation result.
 */
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

/**
 * Implements the sanitizeQuery operation for this module.
 * @param url Input used by the operation.
 * @returns The operation result.
 */
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

/**
 * Implements the fetchP2P operation for this module.
 * @param url Input used by the operation.
 * @returns The operation result.
 */
async function fetchP2P(url: URL): Promise<Response> {
  const params = sanitizeQuery(url);
  const endpoint = new URL("/p2p", QVAPAY_API_BASE_URL);
  endpoint.search = params.toString();

  return marketSnapshot.fetch(endpoint, async (target) => fetch(target, {
    method: "GET",
    headers: qvapayHeaders(),
    signal: AbortSignal.timeout(20_000)
  }));
}

/**
 * Implements the fetchBalance operation for this module.

 * @returns The operation result.
 */
async function fetchBalance(): Promise<Response> {
  const endpoint = new URL("/v2/balance", QVAPAY_API_BASE_URL);
  return fetch(endpoint, {
    method: "POST",
    headers: qvapayHeaders(),
    signal: AbortSignal.timeout(20_000)
  });
}

/**
 * Implements the fetchP2PAction operation for this module.
 * @param uuid Input used by the operation.
 * @param action Input used by the operation.
 * @param method Input used by the operation.
 * @returns The operation result.
 */
async function fetchP2PAction(uuid: string, action: string, method: "POST" | "GET", body?: unknown): Promise<Response> {
  const endpoint = new URL(`/p2p/${encodeURIComponent(uuid)}/${action}`, QVAPAY_API_BASE_URL);
  const headers = qvapayHeaders();
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(endpoint, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000)
  });
}

/**
 * Implements the fetchOperations operation for this module.

 * @returns The operation result.
 */
async function fetchOperations(): Promise<Response> {
  const endpoint = new URL("/p2p", QVAPAY_API_BASE_URL);
  endpoint.search = new URLSearchParams({
    my: "1",
    take: "100",
    sortByStatus: "true"
  }).toString();
  return marketSnapshot.fetch(endpoint, async (target) => fetch(target, {
    method: "GET",
    headers: qvapayHeaders(),
    signal: AbortSignal.timeout(20_000)
  }));
}

/**
 * Implements the fetchP2POffer operation for this module.
 * @param uuid Input used by the operation.
 * @returns The operation result.
 */
async function fetchP2POffer(uuid: string): Promise<Response> {
  const endpoint = new URL(`/p2p/${encodeURIComponent(uuid)}`, QVAPAY_API_BASE_URL);

  return fetch(endpoint, {
    method: "GET",
    headers: qvapayHeaders(),
    signal: AbortSignal.timeout(20_000)
  });
}

/**
 * Implements the applyP2POffer operation for this module.
 * @param uuid Input used by the operation.
 * @returns The operation result.
 */
async function applyP2POffer(uuid: string): Promise<Response> {
  const endpoint = new URL(`/p2p/${encodeURIComponent(uuid)}/apply`, QVAPAY_API_BASE_URL);

  return fetch(endpoint, {
    method: "POST",
    headers: qvapayHeaders(),
    signal: AbortSignal.timeout(20_000)
  });
}

/**
 * Implements the readUpstreamPayload operation for this module.
 * @param upstream Input used by the operation.
 * @returns The operation result.
 */
async function readUpstreamPayload(upstream: Response): Promise<unknown> {
  const text = await upstream.text();

  try {
    return JSON.parse(text);
  } catch {
    return text ? { message: text } : {};
  }
}

/**
 * Implements the readJsonBody operation for this module.
 * @param request Input used by the operation.
 * @returns The operation result.
 */
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

/**
 * Implements the handleApiP2P operation for this module.
 * @param response Input used by the operation.
 * @param url Input used by the operation.
 * @returns The operation result.
 */
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

const MAX_INTELLIGENCE_PAGES = 10;

/**
 * Implements the fetchAllMarketPages operation for this module.
 * @param url Input used by the operation.
 * @returns The operation result.
 */
async function fetchAllMarketPages(url: URL): Promise<{
  offers: Record<string, unknown>[];
  total: number;
  pagesFetched: number;
  truncated: boolean;
}> {
  const base = sanitizeQuery(url);
  base.set("page", "1");
  base.set("take", "100");

  const offers: Record<string, unknown>[] = [];
  let total = 0;
  let perPage = 100;
  let lastPage = 1;
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_INTELLIGENCE_PAGES; page += 1) {
    const params = new URLSearchParams(base);
    params.set("page", String(page));
    const upstream = await fetchP2P(new URL("/p2p?" + params.toString(), "http://127.0.0.1"));
    const payload = await readUpstreamPayload(upstream);

    if (!upstream.ok) {
      throw new Error(JSON.stringify(payload));
    }

    const record = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : {};
    const pageOffers = Array.isArray(record.data)
      ? record.data.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
      : [];

    offers.push(...pageOffers);
    pagesFetched = page;
    total = Number(record.total ?? offers.length);
    perPage = Math.max(1, Number(record.per_page ?? pageOffers.length ?? 100));
    lastPage = Math.max(1, Math.ceil(total / perPage));

    if (page >= lastPage || pageOffers.length === 0) break;
  }

  return {
    offers,
    total,
    pagesFetched,
    truncated: lastPage > MAX_INTELLIGENCE_PAGES
  };
}

/**
 * Implements the handleApiIntelligence operation for this module.
 * @param response Input used by the operation.
 * @param url Input used by the operation.
 * @returns The operation result.
 */
async function handleApiIntelligence(response: ServerResponse, url: URL): Promise<void> {
  try {
    const result = await fetchAllMarketPages(url);
    sendJson(response, 200, {
      intelligence: calculateMarketIntelligence(result.offers as Parameters<typeof calculateMarketIntelligence>[0]),
      coverage: {
        total: result.total,
        pagesFetched: result.pagesFetched,
        truncated: result.truncated
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, message.includes("QVAPAY_APP_ID") ? 500 : 502, { error: message });
  }
}

/**
 * Implements the handleApiP2POffer operation for this module.
 * @param response Input used by the operation.
 * @param uuid Input used by the operation.
 * @returns The operation result.
 */
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

/**
 * Implements the handleApiOperations operation for this module.
 * @param response Input used by the operation.
 * @returns The operation result.
 */
async function handleApiOperations(response: ServerResponse): Promise<void> {
  try {
    const upstream = await fetchOperations();
    const payload = await readUpstreamPayload(upstream);
    sendJson(response, upstream.status, upstream.ok
      ? { operations: payload }
      : { error: "No se pudieron consultar las operaciones", detail: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("QVAPAY_APP_ID") ? 500 : 502;
    sendJson(response, status, status === 500
      ? { error: message }
      : { error: "No se pudo contactar con QvaPay", detail: message });
  }
}

/**
 * Implements the handleApiOperationAction operation for this module.
 * @param response Input used by the operation.
 * @param uuid Input used by the operation.
 * @param action Input used by the operation.
 * @param method Input used by the operation.
 * @param request Input used by the operation.
 * @returns The operation result.
 */
async function handleApiOperationAction(
  response: ServerResponse,
  uuid: string,
  action: "paid" | "received" | "cancel" | "chat" | "rate",
  method: "POST" | "GET",
  request: IncomingMessage,
): Promise<void> {
  if (!uuid || uuid.length > 200) {
    sendJson(response, 400, { error: "Identificador de operación inválido." });
    return;
  }

  try {
    const body = method === "POST" ? await readJsonBody(request) : undefined;
    if (action === "paid") {
      const txId = body && typeof body === "object" ? String((body as Record<string, unknown>).tx_id ?? "").trim() : "";
      if (!txId) {
        sendJson(response, 400, { error: "tx_id es obligatorio para marcar la operación como pagada." });
        return;
      }
      if (txId.length > 500) {
        sendJson(response, 400, { error: "tx_id es demasiado largo." });
        return;
      }
    }
    if (action === "chat" && method === "POST") {
      const message = body && typeof body === "object" ? String((body as Record<string, unknown>).message ?? "").trim() : "";
      if (!message) {
        sendJson(response, 400, { error: "El mensaje es obligatorio." });
        return;
      }
      if (message.length > 599) {
        sendJson(response, 400, { error: "El mensaje no puede superar 599 caracteres." });
        return;
      }
    }
    if (action === "rate" && method === "POST") {
      const value = body && typeof body === "object" ? Number((body as Record<string, unknown>).rating) : NaN;
      if (!Number.isFinite(value) || value < 1 || value > 5) {
        sendJson(response, 400, { error: "La calificación debe estar entre 1 y 5." });
        return;
      }
      const comment = body && typeof body === "object" ? String((body as Record<string, unknown>).comment ?? "") : "";
      if (comment.length > 120) {
        sendJson(response, 400, { error: "El comentario no puede superar 120 caracteres." });
        return;
      }
    }

    const upstream = await fetchP2PAction(uuid, action, method, body);
    const payload = await readUpstreamPayload(upstream);
    if (upstream.ok && action === "received") {
      const detailResponse = await fetchP2POffer(uuid);
      const detailPayload = await readUpstreamPayload(detailResponse);
      if (detailResponse.ok && detailPayload && typeof detailPayload === "object") {
        const detail = (detailPayload as Record<string, unknown>).p2p;
        if (detail && typeof detail === "object") await financeLedger.upsert([detail]);
      }
      await financeLedger.recordSettlement(uuid, payload);
    }
    sendJson(response, upstream.status, upstream.ok
      ? { ok: true, action, offer_uuid: uuid, qvapay: payload }
      : { error: "QvaPay API error", detail: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("QVAPAY_APP_ID") ? 500 : 502;
    sendJson(response, status, status === 500
      ? { error: message }
      : { error: "No se pudo contactar con QvaPay", detail: message });
  }
}

/**
 * Implements the handleApiApplyP2P operation for this module.
 * @param response Input used by the operation.
 * @param uuid Input used by the operation.
 * @returns The operation result.
 */
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

/**
 * Implements the fetchOwnP2P operation for this module.

 * @returns The operation result.
 */
async function fetchOwnP2P(status?: string): Promise<Response> {
  const query = new URLSearchParams({ my: "1", take: "100", orderBy: "updated_at", orderType: "desc" });
  if (status) query.set("status", status);
  return fetchP2P(new URL("/p2p?" + query.toString(), "http://127.0.0.1"));
}

/**
 * Implements the fetchCompletedPage operation for this module.
 * @param page Input used by the operation.
 * @returns The operation result.
 */
async function fetchCompletedPage(page: number): Promise<{ data: Record<string, unknown>[]; total: number; perPage: number }> {
  const query = new URLSearchParams({
    my: "1",
    status: "completed",
    take: "100",
    page: String(page),
    orderBy: "updated_at",
    orderType: "asc",
  });
  const upstream = await fetchP2P(new URL("/p2p?" + query.toString(), "http://127.0.0.1"));
  const payload = await readUpstreamPayload(upstream);
  if (!upstream.ok) throw new Error(JSON.stringify(payload));
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = Array.isArray(record.data)
    ? record.data.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    : [];
  return {
    data,
    total: Number(record.total ?? data.length),
    perPage: Number(record.per_page ?? data.length ?? 100),
  };
}

const marketHistory = new MarketHistoryStore();
const financeLedger = new FinanceLedgerStore();

/**
 * Implements the collectMarketHistory operation for this module.

 * @returns The operation result.
 */
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

/**
 * Implements the handleAutoApplyConfig operation for this module.
 * @param response Input used by the operation.
 * @param method Input used by the operation.
 * @param request Input used by the operation.
 * @returns The operation result.
 */
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

/**
 * Implements the handleRequest operation for this module.
 * @param request Input used by the operation.
 * @param response Input used by the operation.
 * @returns The operation result.
 */
async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "p2p-market-dashboard" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/market/snapshot") {
    sendJson(response, 200, { marketSnapshot: marketSnapshot.getStats() });
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

  if (request.method === "GET" && url.pathname === "/api/baselines") {
    const coin=url.searchParams.get("coin")??undefined;
    const type=url.searchParams.get("type")??undefined;
    const lookback=Number(url.searchParams.get("lookback")??"24");
    const points=marketHistory.query(coin,type,1000);
    sendJson(response,200,{baselines:calculateBaselines(points,Number.isFinite(lookback)?lookback:24)});
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/trends") {
    const coin=url.searchParams.get("coin")??undefined;
    const type=url.searchParams.get("type")??undefined;
    const points=marketHistory.query(coin,type,1000);
    sendJson(response,200,{trends:summarizeTrends(points)});
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/history") {
    const coin=url.searchParams.get("coin")??undefined;
    const type=url.searchParams.get("type")??undefined;
    const limit=Number(url.searchParams.get("limit")??"200");
    sendJson(response,200,{history:marketHistory.query(coin,type,Number.isFinite(limit)?limit:200)});
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/account") {
    try {
      const snapshot = await fetchAccountSnapshot(
        fetchBalance,
        () => fetchOwnP2P("open"),
        () => fetchOwnP2P(),
        readUpstreamPayload,
      );
      sendJson(response, 200, { account: snapshot });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, message.includes("QVAPAY_APP_ID") ? 500 : 502, { error: message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/operations") {
    await handleApiOperations(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/finance") {
    try {
      const remote = await fetchAllCompletedP2P(fetchCompletedPage);
      await financeLedger.upsert(remote.offers);
      const ledger = financeLedger.list();
      const reconciliation = reconcileCompletedIds(remote.offers, ledger);
      const knownFees = ledger.filter((entry) => entry.feeSource === "qvapay_received");
      const feeQusd = knownFees.reduce((sum, entry) => sum + (entry.feeQusd ?? 0), 0);
      sendJson(response, 200, {
        finance: calculateFinanceSummary(ledger),
        fees: {
          knownQusd: feeQusd,
          knownOperations: knownFees.length,
          unknownOperations: ledger.length - knownFees.length,
        },
        source: {
          status: "completed",
          fetched: remote.offers.length,
          remoteTotal: remote.total,
          pagesFetched: remote.pagesFetched,
          truncated: remote.truncated,
          persisted: ledger.length,
        },
        reconciliation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, message.includes("QVAPAY_APP_ID") ? 500 : 502, { error: message });
    }
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

  if (request.method === "GET") {
    const chatMatch = url.pathname.match(/^\/api\/operations\/([^/]+)\/chat$/);
    if (chatMatch?.[1]) {
      let uuid: string;
      try {
        uuid = decodeURIComponent(chatMatch[1]);
      } catch {
        sendJson(response, 400, { error: "Identificador de operación inválido." });
        return;
      }
      await handleApiOperationAction(response, uuid, "chat", "GET", request);
      return;
    }
  }

  if (request.method === "POST") {
    const operationMatch = url.pathname.match(/^\/api\/operations\/([^/]+)\/(paid|received|cancel|chat|rate)$/);
    if (operationMatch?.[1] && operationMatch[2]) {
      let uuid: string;
      try {
        uuid = decodeURIComponent(operationMatch[1]);
      } catch {
        sendJson(response, 400, { error: "Identificador de operación inválido." });
        return;
      }
      const action = operationMatch[2] as "paid" | "received" | "cancel" | "chat" | "rate";
      await handleApiOperationAction(response, uuid, action, "POST", request);
      return;
    }

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

void Promise.all([marketHistory.initialize(), autoApplyEngine.initialize(), financeLedger.initialize()]).then(() => {
  void collectMarketHistory();
  setInterval(() => { void collectMarketHistory(); }, 60_000);
  server.listen(PORT, HOST, () => {
    console.log(`QvaPay P2P Dashboard: http://${HOST}:${PORT}`);
  });
}).catch((error: unknown) => {
  console.error("No se pudo inicializar Auto-Apply:", error);
  process.exitCode = 1;
});