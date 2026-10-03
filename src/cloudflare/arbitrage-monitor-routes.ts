/**
 * @file arbitrage-monitor-routes.ts
 * @path src/cloudflare/arbitrage-monitor-routes.ts
 * @description API de estado y control del monitor server-side de arbitraje.
 * @module cloudflare
 * @status active
 */

import { monitorState } from "./arbitrage-monitor.js";
import type { D1Database } from "./d1.js";

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

interface Env {
  DB: D1Database;
  ARBITRAGE_MONITOR: DurableObjectNamespaceLike;
}

type Json = (payload: unknown, status?: number) => Response;

function stub(env: Env) {
  const id = env.ARBITRAGE_MONITOR.idFromName("global");
  return env.ARBITRAGE_MONITOR.get(id);
}

function operationalError(code: string, error: unknown, json: Json): Response {
  return json(
    {
      error: "No se pudo completar la solicitud.",
      code,
    },
    503,
  );
}

export async function handleArbitrageMonitorRoutes(
  request: Request,
  env: Env,
  url: URL,
  json: Json,
): Promise<Response | null> {
  if (url.pathname !== "/api/arbitrage/monitor") return null;

  if (request.method === "GET") {
    try {
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
    } catch (error) {
      return operationalError("MONITOR_STATE_READ_FAILED", error, json);
    }
  }

  if (request.method !== "POST") return null;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const margin = Number(body.minMarginPercent ?? 5);
    const coin = String(body.coin ?? "BANK_CUP")
      .trim()
      .toUpperCase();
    if (!Number.isFinite(margin) || margin < 0)
      return json({ error: "minMarginPercent inválido." }, 400);
    if (!/^[A-Z0-9_]{2,32}$/.test(coin))
      return json({ error: "coin inválida." }, 400);

    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE arbitrage_monitor_config
       SET min_margin_percent = ?, coin = ?, enabled = 1, updated_at = ?
       WHERE id = 1`,
    )
      .bind(margin, coin, now)
      .run();

    if (Number(result.meta?.changes ?? 0) !== 1) {
      return operationalError(
        "MONITOR_CONFIG_ROW_MISSING",
        new Error("arbitrage_monitor_config id=1 no existe."),
        json,
      );
    }

    await stub(env).fetch(new Request("https://internal/start"));
    return json({
      ok: true,
      minMarginPercent: margin,
      coin,
      nextRunAt: new Date(Date.now() + 10_000).toISOString(),
    });
  } catch (error) {
    return operationalError("MONITOR_CONFIG_WRITE_FAILED", error, json);
  }
}

export async function bootstrapArbitrageMonitor(env: Env): Promise<void> {
  await stub(env).fetch(new Request("https://internal/start"));
}
