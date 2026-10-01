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
import { handleAutoApplyRoutes } from "./auto-apply-routes.js";

export interface WorkerEnv {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  QVAPAY_API_BASE_URL?: string;
  QVAPAY_APP_ID?: string;
  QVAPAY_APP_SECRET?: string;
  AUTH_USERNAME?: string;
  AUTH_PASSWORD?: string;
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
      ...headers,
    },
  });
}

function requestUrl(request: Request): URL {
  return new URL(request.url);
}

export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 1_000_000) throw new Error("Cuerpo de solicitud demasiado grande.");
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON inválido.");
  }
}

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message.includes("QVAPAY_") ? 500 : 502;
}

export async function handleApi(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const url = requestUrl(request);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, service: "qvapay-ai-scanner-worker" });
  }

  const authResponse = await handleAuthRoutes(
    request,
    {
      DB: env.DB as unknown as SessionDatabase,
      AUTH_USERNAME: env.AUTH_USERNAME,
      AUTH_PASSWORD: env.AUTH_PASSWORD,
    },
    url,
    json,
    readJson,
  );
  if (authResponse) return authResponse;

  const diagnosticsResponse = await handleDiagnosticsRoutes(request, env, url, json);
  if (diagnosticsResponse) return diagnosticsResponse;

  const marketResponse = await handleMarketRoutes(request, env, url, json);
  if (marketResponse) return marketResponse;

  const operationsResponse = await handleOperationsRoutes(request, env, url, json, readJson);
  if (operationsResponse) return operationsResponse;

  const financeResponse = await handleFinanceRoutes(request, env, url, json);
  if (financeResponse) return financeResponse;

  const accountResponse = await handleAccountRoutes(request, env, url, json);
  if (accountResponse) return accountResponse;

  const autoApplyResponse = handleAutoApplyRoutes(request, url, json);
  if (autoApplyResponse) return autoApplyResponse;

  return null;
}

export async function routeRequest(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = requestUrl(request);

  if (url.pathname.startsWith("/api/")) {
    if (url.pathname !== "/api/health" && !url.pathname.startsWith("/api/auth/")) {
      const session = await requireSession(request, env.DB as unknown as SessionDatabase);
      if (!session.ok) return session.response;
    }

    if (
      url.pathname !== "/api/health" &&
      requiresSameOrigin(request) &&
      !isSameOrigin(request)
    ) {
      return json({ error: "Las mutaciones sólo aceptan solicitudes same-origin." }, 403);
    }

    try {
      const response = await handleApi(request, env);
      if (response) return response;
    } catch (error) {
      return json({ error: String(error) }, errorStatus(error));
    }
  }

  return null;
}