/**
 * @file ai-audit-routes.ts
 * @path src/cloudflare/ai-audit-routes.ts
 * @description API de diagnóstico para una identidad técnica AI Auditor de sólo lectura.
 * @module cloudflare
 * @status active
 */

import { d1Health, type D1Database } from "./d1.js";
import { monitorState } from "./arbitrage-monitor.js";
import { authorizeAiAuditor } from "./ai-audit-auth.js";

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

function auditError(json: JsonResponse, status: number, error: string): Response {
  return json(
    {
      ok: false,
      error,
      readOnly: true,
      service: "ai-auditor",
    },
    status,
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

async function auditHealth(env: AiAuditEnv): Promise<Record<string, unknown>> {
  const database = await d1Health(env.DB);
  const monitor = await monitorState(env.DB);
  const alarm = await doAlarm(env);

  return {
    ok: database.ok && monitor.state?.status !== "error",
    readOnly: true,
    service: "qvapay-ai-scanner-worker",
    checks: {
      worker: { ok: true },
      database: database,
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
      payload = JSON.parse(current.state.payload_json) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  const alarm = await doAlarm(env);
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
      payload = JSON.parse(current.state.payload_json) as Record<string, unknown>;
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
    marketOffers: Array.isArray(payload.marketOffers)
      ? payload.marketOffers
      : [],
    opportunities: Array.isArray(payload.opportunities)
      ? payload.opportunities
      : [],
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

  const auth = await authorizeAiAuditor(request, env.AI_AUDITOR_TOKEN_HASH);
  if (!auth.ok) {
    return auditError(json, auth.status, auth.error);
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
      return json({
        ok: (await d1Health(env.DB)).ok,
        readOnly: true,
        database: await d1Health(env.DB),
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
