/**
 * @file d1.ts
 * @path src/cloudflare/d1.ts
 * @description Primitivas de persistencia durable D1 para el runtime de Cloudflare Worker.
 * @module cloudflare
 * @status active
 */

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<
    { success: boolean; meta?: { changes?: number } } & T
  >;
  all<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    results: T[];
    meta?: { changes?: number };
  }>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<Array<{ success: boolean; meta?: { changes?: number } } & T>>;
}

export interface MarketHistoryPoint {
  timestamp: string;
  coin: string;
  type: string;
  samples: number;
  minRate: number | null;
  medianRate: number | null;
  maxRate: number | null;
  spread: number | null;
}

export interface FinanceLedgerEntry {
  uuid: string;
  status: "completed";
  type: "buy" | "sell";
  coin: string;
  amount: number;
  receive: number;
  createdAt: string;
  updatedAt: string;
  recordedAt: string;
  grossAmountQusd: number;
  feeQusd: number | null;
  netAmountQusd: number | null;
  feeSource: "qvapay_received" | "unknown";
}

interface MarketRow {
  timestamp: string;
  coin: string;
  type: string;
  samples: number;
  min_rate: number | null;
  median_rate: number | null;
  max_rate: number | null;
  spread: number | null;
}

interface FinanceRow {
  uuid: string;
  status: string;
  type: string;
  coin: string;
  amount: number;
  receive: number;
  created_at: string;
  updated_at: string;
  recorded_at: string;
  gross_amount_qusd: number;
  fee_qusd: number | null;
  net_amount_qusd: number | null;
  fee_source: string;
}

const asNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export async function d1Health(db: D1Database): Promise<{
  ok: boolean;
  tables: string[];
}> {
  const result = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?, ?)",
    )
    .bind(
      "market_history",
      "operations_ledger",
      "finance_ledger",
      "auto_apply_config",
      "market_events",
    )
    .all<{ name: string }>();
  return {
    ok: result.results.length >= 5,
    tables: result.results.map((row) => row.name).sort(),
  };
}

export async function appendMarketHistory(
  db: D1Database,
  points: MarketHistoryPoint[],
): Promise<void> {
  if (!points.length) return;
  await db.batch(
    points.map((point) =>
      db
        .prepare(
          `INSERT INTO market_history
           (timestamp, coin, type, samples, min_rate, median_rate, max_rate, spread)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(timestamp, coin, type) DO UPDATE SET
             samples = excluded.samples,
             min_rate = excluded.min_rate,
             median_rate = excluded.median_rate,
             max_rate = excluded.max_rate,
             spread = excluded.spread`,
        )
        .bind(
          point.timestamp,
          point.coin,
          point.type,
          point.samples,
          point.minRate,
          point.medianRate,
          point.maxRate,
          point.spread,
        ),
    ),
  );
}

export async function queryMarketHistory(
  db: D1Database,
  coin?: string,
  type?: string,
  limit = 200,
): Promise<MarketHistoryPoint[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (coin) {
    clauses.push("coin = ?");
    values.push(coin.trim().toUpperCase());
  }
  if (type) {
    clauses.push("type = ?");
    values.push(type.trim().toLowerCase());
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `SELECT timestamp, coin, type, samples, min_rate, median_rate, max_rate, spread
       FROM market_history${where}
       ORDER BY timestamp ASC
       LIMIT ?`,
    )
    .bind(...values, safeLimit)
    .all<MarketRow>();
  return rows.results.map((row) => ({
    timestamp: row.timestamp,
    coin: row.coin,
    type: row.type,
    samples: asNumber(row.samples),
    minRate: row.min_rate === null ? null : asNumber(row.min_rate),
    medianRate: row.median_rate === null ? null : asNumber(row.median_rate),
    maxRate: row.max_rate === null ? null : asNumber(row.max_rate),
    spread: row.spread === null ? null : asNumber(row.spread),
  }));
}

export async function upsertOperations(
  db: D1Database,
  operations: Record<string, unknown>[],
): Promise<number> {
  const now = new Date().toISOString();
  if (!operations.length) return 0;
  const statements = operations
    .map((operation) => {
      const uuid = String(operation.uuid ?? operation.id ?? "").trim();
      if (!uuid) return null;
      return db
        .prepare(
          `INSERT INTO operations_ledger
           (uuid, payload_json, recorded_at, last_seen_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(uuid) DO UPDATE SET
             payload_json = excluded.payload_json,
             last_seen_at = excluded.last_seen_at`,
        )
        .bind(uuid, JSON.stringify(operation), now, now);
    })
    .filter(
      (statement): statement is D1PreparedStatement => statement !== null,
    );
  if (!statements.length) return 0;
  const results = await db.batch(statements);
  return results.length;
}

export async function listOperationIds(db: D1Database): Promise<string[]> {
  const rows = await db
    .prepare("SELECT uuid FROM operations_ledger ORDER BY last_seen_at DESC")
    .all<{ uuid: string }>();
  return rows.results.map((row) => row.uuid);
}

export async function upsertFinanceEntries(
  db: D1Database,
  entries: FinanceLedgerEntry[],
): Promise<number> {
  if (!entries.length) return 0;
  const statements = entries.map((entry) =>
    db
      .prepare(
        `INSERT INTO finance_ledger
         (uuid, status, type, coin, amount, receive, created_at, updated_at,
          recorded_at, gross_amount_qusd, fee_qusd, net_amount_qusd, fee_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(uuid) DO UPDATE SET
           status = excluded.status,
           type = excluded.type,
           coin = excluded.coin,
           amount = excluded.amount,
           receive = excluded.receive,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        entry.uuid,
        entry.status,
        entry.type,
        entry.coin,
        entry.amount,
        entry.receive,
        entry.createdAt,
        entry.updatedAt,
        entry.recordedAt,
        entry.grossAmountQusd,
        entry.feeQusd,
        entry.netAmountQusd,
        entry.feeSource,
      ),
  );
  const results = await db.batch(statements);
  return results.length;
}

export async function listFinanceEntries(
  db: D1Database,
): Promise<FinanceLedgerEntry[]> {
  const rows = await db
    .prepare(
      `SELECT uuid, status, type, coin, amount, receive, created_at, updated_at,
              recorded_at, gross_amount_qusd, fee_qusd, net_amount_qusd, fee_source
       FROM finance_ledger
       ORDER BY updated_at ASC`,
    )
    .all<FinanceRow>();
  return rows.results
    .filter(
      (row) =>
        row.status === "completed" &&
        (row.type === "buy" || row.type === "sell"),
    )
    .map((row) => ({
      uuid: row.uuid,
      status: "completed",
      type: row.type as "buy" | "sell",
      coin: row.coin,
      amount: asNumber(row.amount),
      receive: asNumber(row.receive),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      recordedAt: row.recorded_at,
      grossAmountQusd: asNumber(row.gross_amount_qusd, asNumber(row.amount)),
      feeQusd: row.fee_qusd === null ? null : asNumber(row.fee_qusd),
      netAmountQusd:
        row.net_amount_qusd === null ? null : asNumber(row.net_amount_qusd),
      feeSource:
        row.fee_source === "qvapay_received" ? "qvapay_received" : "unknown",
    }));
}

export async function recordFinanceSettlement(
  db: D1Database,
  uuid: string,
  settlement: unknown,
): Promise<boolean> {
  if (!settlement || typeof settlement !== "object") return false;
  const value = settlement as Record<string, unknown>;
  const fee = Number(value.fee);
  const gross = Number(value.gross_amount);
  const net = Number(value.amount);
  if (
    !Number.isFinite(fee) ||
    fee < 0 ||
    !Number.isFinite(gross) ||
    gross < 0 ||
    !Number.isFinite(net) ||
    net < 0
  ) {
    return false;
  }
  const result = await db
    .prepare(
      `UPDATE finance_ledger
       SET gross_amount_qusd = ?,
           fee_qusd = ?,
           net_amount_qusd = ?,
           fee_source = 'qvapay_received'
       WHERE uuid = ?`,
    )
    .bind(gross, fee, net, uuid)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export interface MarketEventRow {
  dedupe_key: string;
  event_id: string | null;
  offer_uuid: string;
  event: string;
  status: string | null;
  side: string | null;
  coin: string;
  amount: number | null;
  available_amount: number | null;
  receive: number | null;
  rate: number | null;
  event_at: string;
  observed_at: string;
  source: string;
}

export async function appendMarketEvents(
  db: D1Database,
  events: Array<{
    dedupeKey: string;
    eventId: string | null;
    offerUuid: string;
    event: string;
    status: string | null;
    side: string | null;
    coin: string;
    amount: number | null;
    availableAmount: number | null;
    receive: number | null;
    rate: number | null;
    eventAt: string;
    observedAt: string;
    source: string;
  }>,
): Promise<number> {
  if (!events.length) return 0;
  const BATCH_SIZE = 250;
  let inserted = 0;
  for (let offset = 0; offset < events.length; offset += BATCH_SIZE) {
    const chunk = events.slice(offset, offset + BATCH_SIZE);
    const statements = chunk.map((event) =>
      db
        .prepare(
          `INSERT INTO market_events
           (dedupe_key, event_id, offer_uuid, event, status, side, coin,
            amount, available_amount, receive, rate, event_at, observed_at, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(dedupe_key) DO UPDATE SET
             event_id = excluded.event_id,
             status = excluded.status,
             side = excluded.side,
             coin = excluded.coin,
             amount = excluded.amount,
             available_amount = excluded.available_amount,
             receive = excluded.receive,
             rate = excluded.rate,
             event_at = excluded.event_at,
             observed_at = excluded.observed_at,
             source = excluded.source
           WHERE excluded.observed_at > market_events.observed_at
              OR (excluded.observed_at = market_events.observed_at
                  AND excluded.event_at > market_events.event_at)`,
        )
        .bind(
          event.dedupeKey,
          event.eventId,
          event.offerUuid,
          event.event,
          event.status,
          event.side,
          event.coin,
          event.amount,
          event.availableAmount,
          event.receive,
          event.rate,
          event.eventAt,
          event.observedAt,
          event.source,
        ),
    );
    const results = await db.batch(statements);
    inserted += results.reduce(
      (count, result) => count + Number(result.meta?.changes ?? 0),
      0,
    );
  }
  return inserted;
}

export async function listMarketEvents(
  db: D1Database,
  coin?: string,
  limit = 1000,
): Promise<MarketEventRow[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 10000);
  const normalizedCoin = coin?.trim().toUpperCase();
  const result = normalizedCoin
    ? await db
        .prepare(
          `SELECT dedupe_key, event_id, offer_uuid, event, status, side, coin,
                  amount, available_amount, receive, rate, event_at, observed_at, source
           FROM market_events
           WHERE coin = ?
           ORDER BY event_at DESC, observed_at DESC
           LIMIT ?`,
        )
        .bind(normalizedCoin, safeLimit)
        .all<MarketEventRow>()
    : await db
        .prepare(
          `SELECT dedupe_key, event_id, offer_uuid, event, status, side, coin,
                  amount, available_amount, receive, rate, event_at, observed_at, source
           FROM market_events
           ORDER BY event_at ASC, observed_at ASC
           LIMIT ?`,
        )
        .bind(safeLimit)
        .all<MarketEventRow>();
  return result.results;
}

export async function listMarketEventsForAnalytics(
  db: D1Database,
  coin: string,
  completedLimit = 500,
): Promise<MarketEventRow[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(completedLimit), 1), 1000);
  const normalizedCoin = coin.trim().toUpperCase();
  if (!normalizedCoin) return [];

  const result = await db
    .prepare(
      `SELECT dedupe_key, event_id, offer_uuid, event, status, side, coin,
              amount, available_amount, receive, rate, event_at, observed_at, source
       FROM market_events
       WHERE coin = ?
         AND offer_uuid IN (
           SELECT offer_uuid
           FROM market_events
           WHERE coin = ?
             AND event = 'completed'
             AND amount IS NOT NULL
             AND receive IS NOT NULL
             AND rate IS NOT NULL
           GROUP BY offer_uuid
           ORDER BY MAX(event_at) DESC, MAX(observed_at) DESC
           LIMIT ?
         )
       ORDER BY event_at ASC, observed_at ASC`,
    )
    .bind(normalizedCoin, normalizedCoin, safeLimit)
    .all<MarketEventRow>();

  return result.results;
}
