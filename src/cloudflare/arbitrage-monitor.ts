/**
 * @file arbitrage-monitor.ts
 * @path src/cloudflare/arbitrage-monitor.ts
 * @description Monitor persistente server-side de arbitraje. No depende del navegador.
 * @module cloudflare
 * @status active
 */

import { handleArbitrageRoutes } from "./arbitrage-routes.js";
import { type D1Database } from "./d1.js";
import type { QvaPayHttpEnv } from "./qvapay-http.js";

function monitorJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export interface ArbitrageMonitorEnv extends QvaPayHttpEnv {
  DB: D1Database;
}

interface MonitorConfig {
  enabled: boolean;
  minMarginPercent: number;
  coin: string;
  scheduleEnabled: boolean;
  timezone: string;
  startLocal: string | null;
  endLocal: string | null;
  activeDays: number[];
}

interface MonitorRow {
  enabled: number;
  min_margin_percent: number;
  coin: string;
  schedule_enabled: number;
  timezone: string;
  start_local: string | null;
  end_local: string | null;
  active_days_json: string;
}

interface StateRow {
  status: string;
  scan_id: string | null;
  scanned_at: string | null;
  next_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  payload_json: string | null;
  updated_at: string;
}

const INTERVAL_MS = 10_000;

/**
 * Repairs the monitor singleton schema if a deployment reached the Worker
 * before D1 migration 0006 was applied. The migration remains canonical;
 * this guard is an idempotent production safety net and only writes when
 * one of the two monitor tables is actually missing.
 */
export async function ensureArbitrageMonitorSchema(
  db: D1Database,
): Promise<void> {
  const existing = await db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('arbitrage_monitor_config', 'arbitrage_monitor_state')`,
    )
    .all<{ name: string }>();
  const names = new Set(existing.results.map((row) => row.name));
  if (names.has('arbitrage_monitor_config') && names.has('arbitrage_monitor_state')) {
    return;
  }

  const results = await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS arbitrage_monitor_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 1,
        min_margin_percent REAL NOT NULL DEFAULT 5,
        coin TEXT NOT NULL DEFAULT 'BANK_CUP',
        schedule_enabled INTEGER NOT NULL DEFAULT 0,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        start_local TEXT,
        end_local TEXT,
        active_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
        updated_at TEXT NOT NULL
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS arbitrage_monitor_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL DEFAULT 'starting',
        scan_id TEXT,
        scanned_at TEXT,
        next_run_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        payload_json TEXT,
        updated_at TEXT NOT NULL
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_arbitrage_monitor_state_scanned_at
       ON arbitrage_monitor_state (scanned_at DESC)`,
    ),
  ]);
  if (results.some((result) => result.success !== true)) {
    throw new Error('ARBITRAGE_MONITOR_SCHEMA_ENSURE_FAILED');
  }

  const seedResults = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO arbitrage_monitor_config
       (id, enabled, min_margin_percent, coin, schedule_enabled, timezone, active_days_json, updated_at)
       VALUES (1, 1, 5, 'BANK_CUP', 0, 'UTC', '[1,2,3,4,5,6,7]', CURRENT_TIMESTAMP)`,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO arbitrage_monitor_state
       (id, status, updated_at)
       VALUES (1, 'starting', CURRENT_TIMESTAMP)`,
    ),
  ]);
  if (seedResults.some((result) => result.success !== true)) {
    throw new Error('ARBITRAGE_MONITOR_SCHEMA_SEED_FAILED');
  }
}

function readConfig(db: D1Database): Promise<MonitorConfig> {
  return db
    .prepare(
      `SELECT enabled, min_margin_percent, coin, schedule_enabled, timezone,
            start_local, end_local, active_days_json
     FROM arbitrage_monitor_config WHERE id = 1`,
    )
    .first<MonitorRow>()
    .then((row) => {
      if (!row) {
        return {
          enabled: false,
          minMarginPercent: 5,
          coin: "BANK_CUP",
          scheduleEnabled: false,
          timezone: "UTC",
          startLocal: null,
          endLocal: null,
          activeDays: [1, 2, 3, 4, 5, 6, 7],
        };
      }
      let activeDays = [1, 2, 3, 4, 5, 6, 7];
      try {
        const parsed = JSON.parse(row.active_days_json);
        if (Array.isArray(parsed))
          activeDays = parsed.map(Number).filter((n) => n >= 1 && n <= 7);
      } catch {
        /* use all days */
      }
      return {
        enabled: row.enabled === 1,
        minMarginPercent: Number(row.min_margin_percent),
        coin: String(row.coin).toUpperCase(),
        scheduleEnabled: row.schedule_enabled === 1,
        timezone: row.timezone || "UTC",
        startLocal: row.start_local,
        endLocal: row.end_local,
        activeDays,
      };
    });
}

function localParts(
  date: Date,
  timezone: string,
): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const days: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { day: days[weekday] ?? 1, minutes: hour * 60 + minute };
}

function parseTime(value: string | null): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
}

function scheduleActive(config: MonitorConfig, now: Date): boolean {
  if (!config.scheduleEnabled) return true;
  const start = parseTime(config.startLocal);
  const end = parseTime(config.endLocal);
  if (start === null || end === null || !config.activeDays.length) return false;
  const { day, minutes } = localParts(now, config.timezone);
  if (!config.activeDays.includes(day)) return false;
  if (start === end) return true;
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

async function saveState(
  db: D1Database,
  state: {
    status: string;
    scanId?: string | null;
    scannedAt?: string | null;
    nextRunAt?: string | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    payloadJson?: string | null;
  },
): Promise<void> {
  const current = await db
    .prepare(
      "SELECT scan_id, scanned_at, next_run_at, last_success_at, last_error, payload_json FROM arbitrage_monitor_state WHERE id = 1",
    )
    .first<StateRow>();
  await db
    .prepare(
      `INSERT INTO arbitrage_monitor_state
       (id,status,scan_id,scanned_at,next_run_at,last_success_at,last_error,payload_json,updated_at)
     VALUES (1,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       status=excluded.status,
       scan_id=excluded.scan_id,
       scanned_at=excluded.scanned_at,
       next_run_at=excluded.next_run_at,
       last_success_at=excluded.last_success_at,
       last_error=excluded.last_error,
       payload_json=excluded.payload_json,
       updated_at=excluded.updated_at`,
    )
    .bind(
      state.status,
      state.scanId ?? current?.scan_id ?? null,
      state.scannedAt ?? current?.scanned_at ?? null,
      state.nextRunAt ?? current?.next_run_at ?? null,
      state.lastSuccessAt ?? current?.last_success_at ?? null,
      state.lastError ?? null,
      state.payloadJson ?? current?.payload_json ?? null,
      new Date().toISOString(),
    )
    .run();
}

export async function runArbitrageMonitor(
  db: D1Database,
  env: ArbitrageMonitorEnv,
): Promise<{ ok: boolean; payload?: unknown; error?: string }> {
  await ensureArbitrageMonitorSchema(db);
  const config = await readConfig(db);
  if (!config.enabled) {
    await saveState(db, { status: "disabled", lastError: null });
    return { ok: true };
  }
  if (!scheduleActive(config, new Date())) {
    await saveState(db, { status: "scheduled-paused", lastError: null });
    return { ok: true };
  }

  const request = new Request(
    `https://internal/api/arbitrage/scan?minMarginPercent=${encodeURIComponent(config.minMarginPercent)}&coin=${encodeURIComponent(config.coin)}`,
    { method: "GET" },
  );
  const response = await handleArbitrageRoutes(
    request,
    env,
    new URL(request.url),
    monitorJson,
  );
  if (!response) throw new Error("ARBITRAGE_ROUTE_NOT_FOUND");
  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : null;
    const upstreamStatus =
      typeof payload.upstreamStatus === "number"
        ? payload.upstreamStatus
        : response.status;
    const message = detail
      ? `QvaPay HTTP ${upstreamStatus}: ${detail}`
      : String(payload.error ?? `HTTP ${response.status}`);
    await saveState(db, {
      status: "error",
      lastError: message,
      nextRunAt: new Date(Date.now() + INTERVAL_MS).toISOString(),
    });
    return { ok: false, error: message };
  }

  const scannedAt = String(
    (payload.marketSimulation as Record<string, unknown> | undefined)
      ?.scannedAt ?? new Date().toISOString(),
  );
  const scanId = `${scannedAt}-${config.coin}`;
  await saveState(db, {
    status: "running",
    scanId,
    scannedAt,
    nextRunAt: new Date(Date.now() + INTERVAL_MS).toISOString(),
    lastSuccessAt: scannedAt,
    lastError: null,
    payloadJson: JSON.stringify(payload),
  });
  return { ok: true, payload };
}

export async function monitorState(db: D1Database): Promise<{
  config: MonitorConfig;
  state: StateRow | null;
}> {
  await ensureArbitrageMonitorSchema(db);
  const config = await readConfig(db);
  const state = await db
    .prepare(
      "SELECT status, scan_id, scanned_at, next_run_at, last_success_at, last_error, payload_json, updated_at FROM arbitrage_monitor_state WHERE id = 1",
    )
    .first<StateRow>();
  return { config, state };
}

export { INTERVAL_MS };
