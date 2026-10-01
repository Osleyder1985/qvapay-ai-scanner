import {
  d1Health,
  type D1Database,
} from "./cloudflare/d1.js";
import { calculateFinanceSummary } from "./backend/finance.js";
import { summarizeTrends } from "./backend/trend-engine.js";
import { parseQvaPayApplicationIdentity } from "./cloudflare/qvapay-identity.js";
import { evaluateQvaPayAccountContract } from "./cloudflare/qvapay-account-contract.js";
import { qvapay, readQvaPayPayload } from "./cloudflare/qvapay-http.js";
import { handleAuthRoutes } from "./cloudflare/auth-routes.js";
import { requireSession, type SessionDatabase } from "./cloudflare/access.js";
import { handleFinanceRoutes } from "./cloudflare/finance-routes.js";
import { handleOperationsRoutes } from "./cloudflare/operations-routes.js";
import { handleMarketRoutes } from "./cloudflare/market-routes.js";
import { handleAccountRoutes } from "./cloudflare/account-routes.js";


/**
 * @file worker.ts
 * @path src/worker.ts
 * @description Cloudflare Worker entrypoint for QvaPay AI Scanner.
 * @module cloudflare
 * @status active
 * @balance-contract Supports only the documented { balance: number } response.
 *
 * The legacy Node runtime remains available through src/backend/server.ts for
 * local development. This entrypoint adapts the dashboard API to the
 * request/response model used by Cloudflare Workers and serves the existing
 * frontend through Workers Static Assets.
 */

interface WorkerEnv {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  QVAPAY_API_BASE_URL?: string;
  QVAPAY_APP_ID?: string;
  QVAPAY_APP_SECRET?: string;
  AUTH_USERNAME?: string;
  AUTH_PASSWORD?: string;
}

const MAX_PAGE_SIZE = 100;
const MAX_MARKET_PAGES = 10;
const MAX_OPERATION_PAGES = 100;

type JsonRecord = Record<string, unknown>;

function json(
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

function safeUuid(value: string | undefined): string | null {
  if (!value || value.length > 200) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 1_000_000)
    throw new Error("Cuerpo de solicitud demasiado grande.");
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON inválido.");
  }
}

async function handleApi(
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

  if (
    request.method === "GET" &&
    url.pathname === "/api/cloudflare/d1/health"
  ) {
    try {
      return json(await d1Health(env.DB));
    } catch (error) {
      return json(
        {
          ok: false,
          error: "D1 no está disponible o no tiene el esquema aplicado.",
          detail: String(error),
        },
        503,
      );
    }
  }

  const marketResponse = await handleMarketRoutes(request, env, url, json);
  if (marketResponse) return marketResponse;

  const operationsResponse = await handleOperationsRoutes(request, env, url, json, readJson);
  if (operationsResponse) return operationsResponse;

  const financeResponse = await handleFinanceRoutes(request, env, url, json);
  if (financeResponse) return financeResponse;

  if (request.method === "GET" && url.pathname === "/api/auto-apply/config") {
    return json({
      config: {
        enabled: false,
        type: "sell",
        coin: "",
        rateMin: null,
        rateMax: null,
        amountMin: null,
        amountMax: null,
        dailyMaxQusd: null,
        maxConcurrent: 1,
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/api/auto-apply/status") {
    return json({
      status: {
        running: false,
        lastScanAt: null,
        lastActionAt: null,
        lastMessage:
          "Auto-Apply permanece desactivado en Cloudflare hasta añadir almacenamiento persistente y un scheduler.",
        dailyDate: new Date().toISOString().slice(0, 10),
        dailyAppliedQusd: 0,
        recentApplyAttempts: [],
        appliedOfferIds: [],
      },
    });
  }

  if (
    (request.method === "PUT" || request.method === "PATCH") &&
    url.pathname === "/api/auto-apply/config"
  ) {
    return json(
      {
        error:
          "Auto-Apply no puede persistir configuración ni ejecutar scans periódicos en esta fase de migración Cloudflare.",
      },
      501,
    );
  }

  return null;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/login") {
      return env.ASSETS.fetch(
        new Request(new URL("/login.html", request.url), request),
      );
    }

    if (url.pathname.startsWith("/api/")) {
      if (
        url.pathname !== "/api/health" &&
        !url.pathname.startsWith("/api/auth/")
      ) {
        const session = await requireSession(
          request,
          env.DB as unknown as SessionDatabase,
        );
        if (!session.ok) return session.response;
      }

      if (
        url.pathname !== "/api/health" &&
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
        return json({ error: String(error) }, errorStatus(error));
      }
    }

    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      const session = await requireSession(
        request,
        env.DB as unknown as SessionDatabase,
      );
      if (!session.ok) {
        return Response.redirect(new URL("/login", request.url), 302);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
