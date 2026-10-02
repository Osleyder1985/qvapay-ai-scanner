/**
 * @file arbitrage-monitor-do.ts
 * @path src/cloudflare/arbitrage-monitor-do.ts
 * @description Durable Object que mantiene vivo el escaneo de arbitraje cada 10 segundos.
 * @module cloudflare
 * @status active
 */

import { runArbitrageMonitor, INTERVAL_MS, type ArbitrageMonitorEnv } from "./arbitrage-monitor.js";

export class ArbitrageMonitor {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: ArbitrageMonitorEnv & { ARBITRAGE_MONITOR?: DurableObjectNamespace },
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/internal/start") {
      await this.ctx.storage.setAlarm(Date.now());
      return new Response("started");
    }
    if (url.pathname === "/internal/run-now") {
      await this.ctx.storage.setAlarm(Date.now());
      return new Response("scheduled");
    }
    if (url.pathname === "/internal/status") {
      return Response.json({ alarm: await this.ctx.storage.getAlarm() });
    }
    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    try {
      const result = await runArbitrageMonitor(this.env.DB, this.env);
      if (result.ok) {
        await this.ctx.storage.setAlarm(Date.now() + INTERVAL_MS);
      } else {
        await this.ctx.storage.setAlarm(Date.now() + INTERVAL_MS);
      }
    } catch (error) {
      await this.env.DB.prepare(
        `UPDATE arbitrage_monitor_state
         SET status = 'error', last_error = ?, next_run_at = ?, updated_at = ?
         WHERE id = 1`,
      ).bind(
        error instanceof Error ? error.message : "Unknown monitor error",
        new Date(Date.now() + INTERVAL_MS).toISOString(),
        new Date().toISOString(),
      ).run();
      await this.ctx.storage.setAlarm(Date.now() + INTERVAL_MS);
    }
  }
}
