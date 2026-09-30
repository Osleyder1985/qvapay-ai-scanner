/**
 * @file d1-repository.ts
 * @path src/backend/cloudflare/d1-repository.ts
 * @description D1 persistence boundary for QvaPay AI Scanner.
 * @module backend/cloudflare
 * @status migration
 *
 * Esta capa no depende de APIs globales de Cloudflare. Recibe una abstracción
 * mínima compatible con D1 para poder probar idempotencia desde Node antes de
 * conectar Workers/D1 al runtime de producción.
 */

import type { P2POperation } from "../operations.js";
import type { FinanceLedgerEntry } from "../finance-ledger.js";

export interface D1Result {
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatement;
}

export interface D1OperationRow {
  uuid: string;
  type: string | null;
  status: string | null;
  amount: number | null;
  receive: number | null;
  current_user_id: string | null;
  user_uuid: string | null;
  user_id: string | null;
  user_username: string | null;
  user_name: string | null;
  peer_uuid: string | null;
  peer_id: string | null;
  peer_username: string | null;
  peer_name: string | null;
  recorded_at: string;
  last_seen_at: string;
  raw_json: string;
}

export interface D1AutoApplyConfigRow {
  id: 1;
  enabled: number;
  type: "buy" | "sell";
  coin: string;
  rate_min: number | null;
  rate_max: number | null;
  amount_min: number | null;
  amount_max: number | null;
  daily_max_qusd: number | null;
  max_concurrent: number;
  updated_at: string;
}

export interface D1AutoApplyStateRow {
  id: 1;
  daily_date: string;
  daily_applied_qusd: number;
  last_scan_at: string | null;
  last_action_at: string | null;
  last_message: string;
  updated_at: string;
}

export interface D1FinanceRow {
  uuid: string;
  status: "completed";
  type: "buy" | "sell";
  coin: string;
  amount: number;
  receive: number;
  created_at: string;
  updated_at: string;
  recorded_at: string;
  gross_amount_qusd: number;
  fee_qusd: number | null;
  net_amount_qusd: number | null;
  fee_source: "qvapay_received" | "unknown";
}

export interface SyncRunInput {
  startedAt: string;
  finishedAt?: string | null;
  pagesFetched: number;
  remoteCount: number;
  ledgerCount: number;
  missingInLedgerCount: number;
  staleLocalCount: number;
  truncated: boolean;
  status: "running" | "completed" | "failed" | "truncated";
  errorMessage?: string | null;
}

const UPSERT_OPERATION_SQL = `
INSERT INTO p2p_operations (
  uuid, type, status, amount, receive, current_user_id,
  user_uuid, user_id, user_username, user_name,
  peer_uuid, peer_id, peer_username, peer_name,
  recorded_at, last_seen_at, raw_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(uuid) DO UPDATE SET
  type = excluded.type,
  status = excluded.status,
  amount = excluded.amount,
  receive = excluded.receive,
  current_user_id = excluded.current_user_id,
  user_uuid = excluded.user_uuid,
  user_id = excluded.user_id,
  user_username = excluded.user_username,
  user_name = excluded.user_name,
  peer_uuid = excluded.peer_uuid,
  peer_id = excluded.peer_id,
  peer_username = excluded.peer_username,
  peer_name = excluded.peer_name,
  last_seen_at = excluded.last_seen_at,
  raw_json = excluded.raw_json
`;

const UPSERT_FINANCE_SQL = `
INSERT INTO finance_ledger (
  uuid, status, type, coin, amount, receive,
  created_at, updated_at, recorded_at,
  gross_amount_qusd, fee_qusd, net_amount_qusd, fee_source
) VALUES (?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(uuid) DO UPDATE SET
  status = excluded.status,
  type = excluded.type,
  coin = excluded.coin,
  amount = excluded.amount,
  receive = excluded.receive,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  gross_amount_qusd = CASE
    WHEN finance_ledger.fee_source = 'qvapay_received'
    THEN finance_ledger.gross_amount_qusd
    ELSE excluded.gross_amount_qusd
  END,
  fee_qusd = CASE
    WHEN finance_ledger.fee_source = 'qvapay_received'
    THEN finance_ledger.fee_qusd
    ELSE excluded.fee_qusd
  END,
  net_amount_qusd = CASE
    WHEN finance_ledger.fee_source = 'qvapay_received'
    THEN finance_ledger.net_amount_qusd
    ELSE excluded.net_amount_qusd
  END,
  fee_source = CASE
    WHEN finance_ledger.fee_source = 'qvapay_received'
    THEN finance_ledger.fee_source
    ELSE excluded.fee_source
  END
`;

const INSERT_MARKET_SNAPSHOT_SQL = `
INSERT INTO market_snapshots (
  captured_at, coin, type, samples, min_rate, median_rate, max_rate, spread, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_ATTEMPT_SQL = `
INSERT INTO auto_apply_attempts (
  offer_uuid, attempted_at, http_status, success, amount_qusd, response_json, reason
) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_APPLIED_SQL = `
INSERT OR IGNORE INTO auto_apply_applied_offers (
  offer_uuid, applied_at, amount_qusd
) VALUES (?, ?, ?)
`;

const UPSERT_VIP_REJECTION_SQL = `
INSERT INTO auto_apply_vip_rejections (
  offer_uuid, rejected_at, expires_at, reason
) VALUES (?, ?, ?, ?)
ON CONFLICT(offer_uuid) DO UPDATE SET
  rejected_at = excluded.rejected_at,
  expires_at = excluded.expires_at,
  reason = excluded.reason
`;

const INSERT_SYNC_RUN_SQL = `
INSERT INTO sync_runs (
  started_at, finished_at, pages_fetched, remote_count, ledger_count,
  missing_in_ledger_count, stale_local_count, truncated, status, error_message
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function partyValue(
  party: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  return textOrNull(party?.[key]);
}

function operationValues(
  operation: P2POperation,
  recordedAt: string,
  lastSeenAt: string,
): unknown[] {
  const user = operation.User as Record<string, unknown> | null | undefined;
  const peer = operation.Peer as Record<string, unknown> | null | undefined;

  return [
    String(operation.uuid ?? ""),
    textOrNull(operation.type),
    textOrNull(operation.status),
    nullableNumber(operation.amount),
    nullableNumber(operation.receive),
    textOrNull(operation.currentUserId),
    partyValue(user, "uuid"),
    partyValue(user, "id"),
    partyValue(user, "username"),
    partyValue(user, "name"),
    partyValue(peer, "uuid"),
    partyValue(peer, "id"),
    partyValue(peer, "username"),
    partyValue(peer, "name"),
    recordedAt,
    lastSeenAt,
    JSON.stringify(operation),
  ];
}

export class D1Repository {
  constructor(private readonly db: D1DatabaseLike) {}

  /**
   * Upserts operations by QvaPay UUID without changing the original recordedAt.
   */
  async upsertOperations(
    operations: P2POperation[],
    now = new Date().toISOString(),
  ): Promise<number> {
    let written = 0;
    for (const operation of operations) {
      const uuid = String(operation.uuid ?? "").trim();
      if (!uuid) continue;
      await this.db
        .prepare(UPSERT_OPERATION_SQL)
        .bind(...operationValues(operation, now, now))
        .run();
      written += 1;
    }
    return written;
  }

  /**
   * Returns one operation by its QvaPay UUID.
   */
  async getOperation(uuid: string): Promise<D1OperationRow | null> {
    return this.db
      .prepare("SELECT * FROM p2p_operations WHERE uuid = ?")
      .bind(uuid)
      .first<D1OperationRow>();
  }

  /**
   * Lists operations in most-recently-seen order.
   */
  async listOperations(limit = 100): Promise<D1OperationRow[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);
    const result = await this.db
      .prepare(
        "SELECT * FROM p2p_operations ORDER BY last_seen_at DESC LIMIT ?",
      )
      .bind(safeLimit)
      .all<D1OperationRow>();
    return result.results;
  }

  /**
   * Upserts completed finance entries while preserving a previously confirmed fee.
   * The referenced operation must already exist because the D1 schema uses a foreign key.
   */
  async upsertFinance(entries: FinanceLedgerEntry[]): Promise<number> {
    let written = 0;
    for (const entry of entries) {
      await this.db
        .prepare(UPSERT_FINANCE_SQL)
        .bind(
          entry.uuid,
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
        )
        .run();
      written += 1;
    }
    return written;
  }

  async getFinance(uuid: string): Promise<D1FinanceRow | null> {
    return this.db
      .prepare("SELECT * FROM finance_ledger WHERE uuid = ?")
      .bind(uuid)
      .first<D1FinanceRow>();
  }

  async appendMarketSnapshot(
    point: {
      timestamp: string;
      coin: string;
      type: string;
      samples: number;
      minRate: number | null;
      medianRate: number | null;
      maxRate: number | null;
      spread: number | null;
    },
    createdAt = new Date().toISOString(),
  ): Promise<void> {
    await this.db
      .prepare(INSERT_MARKET_SNAPSHOT_SQL)
      .bind(
        point.timestamp,
        point.coin,
        point.type,
        point.samples,
        point.minRate,
        point.medianRate,
        point.maxRate,
        point.spread,
        createdAt,
      )
      .run();
  }

  async getAutoApplyConfig(): Promise<D1AutoApplyConfigRow | null> {
    return this.db
      .prepare("SELECT * FROM auto_apply_config WHERE id = 1")
      .bind()
      .first<D1AutoApplyConfigRow>();
  }

  async getAutoApplyState(): Promise<D1AutoApplyStateRow | null> {
    return this.db
      .prepare("SELECT * FROM auto_apply_state WHERE id = 1")
      .bind()
      .first<D1AutoApplyStateRow>();
  }

  async recordAutoApplyAttempt(input: {
    offerUuid: string;
    attemptedAt: string;
    httpStatus: number | null;
    success: boolean;
    amountQusd: number | null;
    responseJson: string | null;
    reason: string | null;
  }): Promise<void> {
    await this.db
      .prepare(INSERT_ATTEMPT_SQL)
      .bind(
        input.offerUuid,
        input.attemptedAt,
        input.httpStatus,
        input.success ? 1 : 0,
        input.amountQusd,
        input.responseJson,
        input.reason,
      )
      .run();
  }

  /**
   * INSERT OR IGNORE makes this operation safe to repeat after a retry.
   * A duplicate offer UUID never creates a second applied-offer record.
   */
  async recordAppliedOffer(
    offerUuid: string,
    appliedAt: string,
    amountQusd: number,
  ): Promise<void> {
    await this.db
      .prepare(INSERT_APPLIED_SQL)
      .bind(offerUuid, appliedAt, amountQusd)
      .run();
  }

  async recordVipRejection(input: {
    offerUuid: string;
    rejectedAt: string;
    expiresAt: string;
    reason: string;
  }): Promise<void> {
    await this.db
      .prepare(UPSERT_VIP_REJECTION_SQL)
      .bind(input.offerUuid, input.rejectedAt, input.expiresAt, input.reason)
      .run();
  }

  async recordSyncRun(input: SyncRunInput): Promise<void> {
    await this.db
      .prepare(INSERT_SYNC_RUN_SQL)
      .bind(
        input.startedAt,
        input.finishedAt ?? null,
        input.pagesFetched,
        input.remoteCount,
        input.ledgerCount,
        input.missingInLedgerCount,
        input.staleLocalCount,
        input.truncated ? 1 : 0,
        input.status,
        input.errorMessage ?? null,
      )
      .run();
  }
}
