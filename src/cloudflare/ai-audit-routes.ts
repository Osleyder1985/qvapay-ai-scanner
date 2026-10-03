/**
 * @file ai-audit-routes.ts
 * @path src/cloudflare/ai-audit-routes.ts
 * @description API de diagnóstico para una identidad técnica AI Auditor de sólo lectura.
 * @module cloudflare
 * @status active
 */

import { authorizeAiAuditor } from "./ai-audit-auth.js";
import { monitorState } from "./arbitrage-monitor.js";
import { d1Health, type D1Database } from "./d1.js";

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

export interface AiAuditEnv {
  DB: D1Database;
  ARBITRAGE_MONITOR: DurableObjectNamespaceLike;
  AI_AUDITOR_TOKEN_HASH?: string;
  QVAPAY_API_BASE_URL?: string;
  QVAPAY_APP_ID?: string;
  QVAPAY_APP_SECRET?: string;
  QVAPAY_FEED_SECRET?: string;
  AI_AUDITOR_BUILD_SHA?: string;
}

type JsonResponse = (
  payload: unknown,
  status?: number,
  headers?: Record<string, string>,
) => Response;

export function sanitizeObjectArray(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const source = item as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in source) safe[key] = source[key];
    }
    return [safe];
  });
}

const MARKET_OFFER_AUDIT_KEYS = [
  "uuid",
  "coin",
  "type",
  "amountQusd",
  "availableQusd",
  "purchaseRate",
  "capitalRequiredFiat",
  "targetSaleRate",
  "targetSaleProceedsFiat",
  "projectedGrossProfitFiat",
  "projectedGrossMarginPercent",
  "offerKind",
  "orderMinQusd",
  "orderMaxQusd",
  "updatedAt",
] as const;

const OPPORTUNITY_AUDIT_KEYS = [
  "coin",
  "buyOfferUuid",
  "sellOfferUuid",
  "acquisitionOfferUuid",
  "exitOfferUuid",
  "buyRate",
  "sellRate",
  "quantityQusd",
  "capitalRequiredFiat",
  "grossProfitFiat",
  "grossMarginPercent",
  "buyFeeFiat",
  "sellFeeFiat",
  "totalFeesFiat",
  "netProfitFiat",
  "netMarginPercent",
  "feesStatus",
  "observedAt",
  "stale",
] as const;

function auditError(
  json: JsonResponse,
  status: number,
  error: string,
): Response {
  const headers =
    status === 405
      ? { Allow: "GET" }
      : status === 429
        ? { "Retry-After": "60" }
        : {};
  return json(
    {
      ok: false,
      error,
      readOnly: true,
      service: "ai-auditor",
    },
    status,
    headers,
  );
}

async function doAlarm(env: AiAuditEnv): Promise<number | null> {
  const id = env.ARBITRAGE_MONITOR.idFromName("global");
  const response = await env.ARBITRAGE_MONITOR.get(id).fetch(
    new Request("https://internal/status"),
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { alarm?: unknown };
  return typeof payload.alarm === "number" ? payload.alarm : null;
}

async function ensureAlarm(env: AiAuditEnv): Promise<number | null> {
  const current = await doAlarm(env);
  if (current !== null) return current;
  const id = env.ARBITRAGE_MONITOR.idFromName("global");
  const response = await env.ARBITRAGE_MONITOR.get(id).fetch(
    new Request("https://internal/start"),
  );
  if (!response.ok) return null;
  return doAlarm(env);
}

export async function auditHealth(
  env: AiAuditEnv,
): Promise<Record<string, unknown>> {
  const database = await d1Health(env.DB);
  const monitor = await monitorState(env.DB);
  const alarm = await ensureAlarm(env);

  return {
    ok:
      database.ok &&
      monitor.state !== null &&
      monitor.state.status !== "error" &&
      alarm !== null,
    readOnly: true,
    service: "qvapay-ai-scanner-worker",
    checks: {
      worker: { ok: true },
      database,
      durableObject: { ok: alarm !== null, nextAlarmAt: alarm },
      arbitrageMonitor: {
        ok: monitor.state?.status !== "error",
        status: monitor.state?.status ?? "starting",
        lastSuccessAt: monitor.state?.last_success_at ?? null,
        lastError: monitor.state?.last_error ?? null,
        nextRunAt: monitor.state?.next_run_at ?? null,
      },
      qvapayConfiguration: {
        baseUrlConfigured: Boolean(env.QVAPAY_API_BASE_URL),
        appIdConfigured: Boolean(env.QVAPAY_APP_ID),
        appSecretConfigured: Boolean(env.QVAPAY_APP_SECRET),
        feedSecretConfigured: Boolean(env.QVAPAY_FEED_SECRET),
      },
    },
    runtime: {
      buildSha: env.AI_AUDITOR_BUILD_SHA ?? null,
    },
  };
}

async function auditMonitor(env: AiAuditEnv) {
  const current = await monitorState(env.DB);
  let payload: Record<string, unknown> = {};
  if (current.state?.payload_json) {
    try {
      payload = JSON.parse(current.state.payload_json) as Record<
        string,
        unknown
      >;
    } catch {
      payload = {};
    }
  }

  const alarm = await ensureAlarm(env);
  const marketOffers = Array.isArray(payload.marketOffers)
    ? payload.marketOffers
    : [];
  const opportunities = Array.isArray(payload.opportunities)
    ? payload.opportunities
    : [];

  return {
    ok: current.state?.status !== "error",
    readOnly: true,
    config: current.config,
    state: {
      status: current.state?.status ?? "starting",
      scanId: current.state?.scan_id ?? null,
      scannedAt: current.state?.scanned_at ?? null,
      nextRunAt: current.state?.next_run_at ?? null,
      lastSuccessAt: current.state?.last_success_at ?? null,
      lastError: current.state?.last_error ?? null,
      updatedAt: current.state?.updated_at ?? null,
    },
    durableObject: { nextAlarmAt: alarm },
    snapshot: {
      marketOffers: marketOffers.length,
      opportunities: opportunities.length,
      coverage: payload.coverage ?? null,
    },
  };
}

async function auditArbitrage(env: AiAuditEnv) {
  const current = await monitorState(env.DB);
  let payload: Record<string, unknown> = {};
  if (current.state?.payload_json) {
    try {
      payload = JSON.parse(current.state.payload_json) as Record<
        string,
        unknown
      >;
    } catch {
      payload = {};
    }
  }

  return {
    ok: current.state?.status === "running",
    readOnly: true,
    coin: current.config.coin,
    minMarginPercent: current.config.minMarginPercent,
    scannedAt: current.state?.scanned_at ?? null,
    coverage: payload.coverage ?? null,
    marketOffers: sanitizeObjectArray(
      payload.marketOffers,
      MARKET_OFFER_AUDIT_KEYS,
    ),
    opportunities: sanitizeObjectArray(
      payload.opportunities,
      OPPORTUNITY_AUDIT_KEYS,
    ),
    marketSimulation: payload.marketSimulation ?? null,
  };
}

export async function handleAiAuditRoutes(
  request: Request,
  env: AiAuditEnv,
  url: URL,
  json: JsonResponse,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/ai-audit/")) return null;

  const allowedPaths = new Set([
    "/api/ai-audit/health",
    "/api/ai-audit/monitor",
    "/api/ai-audit/arbitrage",
    "/api/ai-audit/database",
    "/api/ai-audit/runtime",
  ]);
  const auth = await authorizeAiAuditor(request, env.AI_AUDITOR_TOKEN_HASH);
  if (!auth.ok) {
    return auditError(json, auth.status, auth.error);
  }

  if (!allowedPaths.has(url.pathname)) {
    return auditError(json, 404, "Ruta de auditoría no encontrada.");
  }

  try {
    if (url.pathname === "/api/ai-audit/health") {
      return json(await auditHealth(env));
    }

    if (url.pathname === "/api/ai-audit/monitor") {
      return json(await auditMonitor(env));
    }

    if (url.pathname === "/api/ai-audit/arbitrage") {
      return json(await auditArbitrage(env));
    }

    if (url.pathname === "/api/ai-audit/database") {
      const database = await d1Health(env.DB);
      return json({
        ok: database.ok,
        readOnly: true,
        database,
      });
    }

    if (url.pathname === "/api/ai-audit/runtime") {
      return json({
        ok: true,
        readOnly: true,
        service: "qvapay-ai-scanner-worker",
        buildSha: env.AI_AUDITOR_BUILD_SHA ?? null,
        qvapayApiBaseConfigured: Boolean(env.QVAPAY_API_BASE_URL),
        qvapayCredentialsConfigured:
          Boolean(env.QVAPAY_APP_ID) && Boolean(env.QVAPAY_APP_SECRET),
      });
    }

    return auditError(json, 404, "Ruta de auditoría no encontrada.");
  } catch (error) {
    console.error("AI Auditor diagnostic failure:", error);
    return auditError(json, 503, "Diagnóstico no disponible.");
  }
}
