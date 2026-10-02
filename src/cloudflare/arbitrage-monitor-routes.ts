/**
 * @file arbitrage-monitor-routes.ts
 * @path src/cloudflare/arbitrage-monitor-routes.ts
 * @description API de estado y control del monitor server-side de arbitraje.
 * @module cloudflare
 * @status active
 */

import { monitorState } from "./arbitrage-monitor.js";
import type { D1Database } from "./d1.js";
import type { DurableObjectNamespace } from "cloudflare:workers";

interface Env {
  DB: D1Database;
  ARBITRAGE_MONITOR: DurableObjectNamespace;
}

type Json = (payload: unknown, status?: number) => Response;

function stub(env: Env) {
  const id = env.ARBITRAGE_MONITOR.idFromName("global");
  return env.ARBITRAGE_MONITOR.get(id);
}

export async function handleArbitrageMonitorRoutes(
  request: Request,
  env: Env,
  url: URL,
  json: Json,
): Promise<Response | null> {
  if (url.pathname !== "/api/arbitrage/monitor") return null;

  if (request.method === "GET") {
    const current = await monitorState(env.DB);
    let payload: Record<string, unknown> = {};
    if (current.state?.payload_json) {
      try { payload = JSON.parse(current.state.payload_json) as Record<string, unknown>; } catch { payload = {}; }
    }
    return json({
      mode: "read-only",
      executionEnabled: false,
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
      marketOffers: payload.marketOffers ?? [],
      opportunities: payload.opportunities ?? [],
      marketSimulation: payload.marketSimulation ?? null,
      coverage: payload.coverage ?? null,
    });
  }

  if (request.method !== "POST") return null;

  const body = await request.json() as Record<string, unknown>;
  const margin = Number(body.minMarginPercent ?? 5);
  const coin = String(body.coin ?? "BANK_CUP").trim().toUpperCase();
  if (!Number.isFinite(margin) || margin < 0) return json({ error: "minMarginPercent inválido." }, 400);
  if (!/^[A-Z0-9_]{2,32}$/.test(coin)) return json({ error: "coin inválida." }, 400);

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE arbitrage_monitor_config
     SET min_margin_percent = ?, coin = ?, enabled = 1, updated_at = ?
     WHERE id = 1`,
  ).bind(margin, coin, now).run();

  await stub(env).fetch(new Request("https://internal/start"));
  return json({ ok: true, minMarginPercent: margin, coin, nextRunAt: new Date().toISOString() });
}

export async function bootstrapArbitrageMonitor(env: Env): Promise<void> {
  await stub(env).fetch(new Request("https://internal/start"));
}
