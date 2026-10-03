/**
 * @file cloudflare-router.ts
 * @path src/cloudflare/cloudflare-router.ts
 * @description Enrutador principal de la API Cloudflare y frontera de composición.
 * @module cloudflare
 * @status active
 */

import { type D1Database } from "./d1.js";
import { handleAuthRoutes } from "./auth-routes.js";
import {
  isSameOrigin,
  requiresSameOrigin,
  requireSession,
  type SessionDatabase,
} from "./access.js";
import { handleFinanceRoutes } from "./finance-routes.js";
import { handleOperationsRoutes } from "./operations-routes.js";
import { handleMarketRoutes } from "./market-routes.js";
import { handleAccountRoutes } from "./account-routes.js";
import { handleDiagnosticsRoutes } from "./diagnostics-routes.js";
import { handleAiAuditRoutes } from "./ai-audit-routes.js";
import { handleAutoApplyRoutes } from "./auto-apply-routes.js";
import { handleArbitrageHistoryRoutes } from "./arbitrage-history-routes.js";
import { handleArbitrageRoutes } from "./arbitrage-routes.js";
import { ingestArbitrageWebhook } from "./arbitrage-event-ingestion.js";
import { handleArbitrageMonitorRoutes } from "./arbitrage-monitor-routes.js";
import { logInternalError, publicError } from "./error-contract.js";

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface WorkerEnv {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  QVAPAY_API_BASE_URL?: string;
  QVAPAY_APP_ID?: string;
  QVAPAY_APP_SECRET?: string;
  QVAPAY_FEED_SECRET?: string;
  AUTH_USERNAME?: string;
  AUTH_PASSWORD?: string;
  AI_AUDITOR_TOKEN_HASH?: string;
  AI_AUDITOR_BUILD_SHA?: string;
  ARBITRAGE_MONITOR: DurableObjectNamespaceLike;
}

export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'",
  };
}

export function json(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(),
      ...headers,
    },
  });
}

function requestUrl(request: Request): URL {
  return new URL(request.url);
}

export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 1_000_000) {
    throw new Error("Cuerpo de solicitud demasiado grande.");
  }
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON inválido.");
  }
}

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message.includes("QVAPAY_")
    ? 500
    : 502;
}

export async function handleApi(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const url = requestUrl(request);

  const aiAuditResponse = await handleAiAuditRoutes(request, env, url, json);
  if (aiAuditResponse) return aiAuditResponse;

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, service: "qvapay-ai-scanner-worker" });
  }

  if (request.method === "POST" && url.pathname === "/api/arbitrage/webhook") {
    return ingestArbitrageWebhook(request, env.DB, env.QVAPAY_FEED_SECRET);
  }

  const authEnv: Parameters<typeof handleAuthRoutes>[1] = {
    DB: env.DB as unknown as SessionDatabase,
  };
  if (env.AUTH_USERNAME !== undefined)
    authEnv.AUTH_USERNAME = env.AUTH_USERNAME;
  if (env.AUTH_PASSWORD !== undefined)
    authEnv.AUTH_PASSWORD = env.AUTH_PASSWORD;

  const authResponse = await handleAuthRoutes(
    request,
    authEnv,
    url,
    json,
    readJson,
  );
  if (authResponse) return authResponse;

  const diagnosticsResponse = await handleDiagnosticsRoutes(
    request,
    env,
    url,
    json,
  );
  if (diagnosticsResponse) return diagnosticsResponse;

  const marketResponse = await handleMarketRoutes(request, env, url, json);
  if (marketResponse) return marketResponse;

  const operationsResponse = await handleOperationsRoutes(
    request,
    env,
    url,
    json,
    readJson,
  );
  if (operationsResponse) return operationsResponse;

  const financeResponse = await handleFinanceRoutes(request, env, url, json);
  if (financeResponse) return financeResponse;

  const accountResponse = await handleAccountRoutes(request, env, url, json);
  if (accountResponse) return accountResponse;

  const arbitrageMonitorResponse = await handleArbitrageMonitorRoutes(
    request,
    env,
    url,
    json,
  );
  if (arbitrageMonitorResponse) return arbitrageMonitorResponse;

  const arbitrageResponse = await handleArbitrageRoutes(
    request,
    env,
    url,
    json,
  );
  if (arbitrageResponse) return arbitrageResponse;

  const arbitrageHistoryResponse = await handleArbitrageHistoryRoutes(
    request,
    env,
    url,
    json,
  );
  if (arbitrageHistoryResponse) return arbitrageHistoryResponse;

  const autoApplyResponse = handleAutoApplyRoutes(request, url, json);
  if (autoApplyResponse) return autoApplyResponse;

  return null;
}

export async function routeRequest(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const url = requestUrl(request);

  if (url.pathname.startsWith("/api/")) {
    const publicWebhook =
      request.method === "POST" && url.pathname === "/api/arbitrage/webhook";

    if (
      !publicWebhook &&
      url.pathname !== "/api/health" &&
      !url.pathname.startsWith("/api/auth/") &&
      !url.pathname.startsWith("/api/ai-audit/")
    ) {
      const session = await requireSession(
        request,
        env.DB as unknown as SessionDatabase,
      );
      if (!session.ok) return session.response;
    }

    if (
      !publicWebhook &&
      url.pathname !== "/api/health" &&
      !url.pathname.startsWith("/api/ai-audit/") &&
      requiresSameOrigin(request) &&
      !isSameOrigin(request)
    ) {
      return json(
        { error: "Las mutaciones sólo aceptan solicitudes same-origin." },
        403,
      );
    }

    try {
      const response = await handleApi(request, env);
      if (response) return response;
    } catch (error) {
      const code = errorStatus(error) === 500 ? "UPSTREAM_CONTRACT_ERROR" : "INTERNAL_ERROR";
      logInternalError("worker.api_request_failed", code);
      return json(publicError(code, { requestPath: url.pathname }), errorStatus(error));
    }
  }

  return null;
}
