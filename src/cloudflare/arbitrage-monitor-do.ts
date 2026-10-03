/**
 * @file arbitrage-monitor-do.ts
 * @path src/cloudflare/arbitrage-monitor-do.ts
 * @description Durable Object que mantiene vivo el escaneo de arbitraje con intervalo configurable.
 * @module cloudflare
 * @status active
 */

import {
  runArbitrageMonitor,
  getMonitorIntervalMs,
  type ArbitrageMonitorEnv,
} from "./arbitrage-monitor.js";
import { logInternalError } from "./error-contract.js";

interface AlarmStorage {
  setAlarm(timestamp: number): Promise<void>;
  getAlarm(): Promise<number | null>;
}
interface DurableObjectStateLike {
  storage: AlarmStorage;
}

export class ArbitrageMonitor {
  constructor(
    private readonly ctx: DurableObjectStateLike,
    private readonly env: ArbitrageMonitorEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/internal/start") {
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null) {
        const state = await this.env.DB.prepare(
          "SELECT next_run_at FROM arbitrage_monitor_state WHERE id = 1",
        ).first<{ next_run_at: string | null }>();
        const persistedNextRun = state?.next_run_at
          ? Date.parse(state.next_run_at)
          : Number.NaN;
        const nextRunAt = Number.isFinite(persistedNextRun)
          ? Math.max(Date.now(), persistedNextRun)
          : Date.now() + (await getMonitorIntervalMs(this.env.DB));
        await this.ctx.storage.setAlarm(nextRunAt);
        return new Response("started");
      }
      return new Response("already-running");
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
      await runArbitrageMonitor(this.env.DB, this.env);
    } catch (error) {
      logInternalError("arbitrage_monitor.alarm_failed", "MONITOR_RUN_FAILED");
      await this.env.DB.prepare(
        `UPDATE arbitrage_monitor_state
         SET status = 'error', last_error = ?, next_run_at = ?, updated_at = ?
         WHERE id = 1`,
      )
        .bind(
          "MONITOR_RUN_FAILED",
          new Date(
            Date.now() + (await getMonitorIntervalMs(this.env.DB)),
          ).toISOString(),
          new Date().toISOString(),
        )
        .run();
    } finally {
      // Always schedule the next cycle, including upstream/API failures. Read the
      // persisted cadence so changing the configuration takes effect on the next cycle.
      let intervalMs = 10_000;
      try {
        intervalMs = await getMonitorIntervalMs(this.env.DB);
      } catch {
        // Keep the fail-safe 10-second cadence if configuration cannot be read.
      }
      const nextAlarmAt = Date.now() + intervalMs;
      await this.ctx.storage.setAlarm(nextAlarmAt);
      await this.env.DB.prepare(
        "UPDATE arbitrage_monitor_state SET next_run_at = ?, updated_at = ? WHERE id = 1",
      )
        .bind(new Date(nextAlarmAt).toISOString(), new Date().toISOString())
        .run();
    }
  }
}
