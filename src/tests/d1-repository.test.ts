/**
 * @file d1-repository.test.ts
 * @path src/tests/d1-repository.test.ts
 * @description Idempotency tests for the Cloudflare D1 repository boundary.
 * @module tests
 * @status test
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  D1Repository,
  type D1DatabaseLike,
  type D1PreparedStatement,
} from "../backend/cloudflare/d1-repository.js";
import type { FinanceLedgerEntry } from "../backend/finance-ledger.js";
import type { P2POperation } from "../backend/operations.js";

class FakeStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly db: FakeD1,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async run(): Promise<{ success: boolean }> {
    this.db.execute(this.sql, this.values);
    return { success: true };
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.values);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.all<T>(this.sql, this.values) };
  }
}

class FakeD1 implements D1DatabaseLike {
  readonly operations = new Map<string, Record<string, unknown>>();
  readonly finance = new Map<string, Record<string, unknown>>();
  readonly applied = new Map<string, Record<string, unknown>>();
  readonly statements: Array<{ sql: string; values: unknown[] }> = [];

  prepare(sql: string): D1PreparedStatement {
    return new FakeStatement(sql, this);
  }

  execute(sql: string, values: unknown[]): void {
    this.statements.push({ sql, values: [...values] });

    if (sql.includes("INSERT INTO p2p_operations")) {
      const [
        uuid,
        type,
        status,
        amount,
        receive,
        currentUserId,
        userUuid,
        userId,
        userUsername,
        userName,
        peerUuid,
        peerId,
        peerUsername,
        peerName,
        recordedAt,
        lastSeenAt,
        rawJson,
      ] = values;
      const previous = this.operations.get(String(uuid));
      this.operations.set(String(uuid), {
        uuid,
        type,
        status,
        amount,
        receive,
        current_user_id: currentUserId,
        user_uuid: userUuid,
        user_id: userId,
        user_username: userUsername,
        user_name: userName,
        peer_uuid: peerUuid,
        peer_id: peerId,
        peer_username: peerUsername,
        peer_name: peerName,
        recorded_at: previous?.recorded_at ?? recordedAt,
        last_seen_at: lastSeenAt,
        raw_json: rawJson,
      });
      return;
    }

    if (sql.includes("INSERT INTO finance_ledger")) {
      const [
        uuid,
        type,
        coin,
        amount,
        receive,
        createdAt,
        updatedAt,
        recordedAt,
        gross,
        fee,
        net,
        feeSource,
      ] = values;
      const previous = this.finance.get(String(uuid));
      const confirmed = previous?.fee_source === "qvapay_received";
      this.finance.set(String(uuid), {
        uuid,
        status: "completed",
        type,
        coin,
        amount,
        receive,
        created_at: createdAt,
        updated_at: updatedAt,
        recorded_at: recordedAt,
        gross_amount_qusd: confirmed
          ? previous?.gross_amount_qusd
          : gross,
        fee_qusd: confirmed ? previous?.fee_qusd : fee,
        net_amount_qusd: confirmed ? previous?.net_amount_qusd : net,
        fee_source: confirmed ? previous?.fee_source : feeSource,
      });
      return;
    }

    if (sql.includes("INSERT OR IGNORE INTO auto_apply_applied_offers")) {
      const [uuid, appliedAt, amountQusd] = values;
      if (!this.applied.has(String(uuid))) {
        this.applied.set(String(uuid), { uuid, appliedAt, amountQusd });
      }
    }
  }

  first<T>(sql: string, values: unknown[]): T | null {
    if (sql.includes("FROM p2p_operations")) {
      return (this.operations.get(String(values[0])) as T | undefined) ?? null;
    }
    if (sql.includes("FROM finance_ledger")) {
      return (this.finance.get(String(values[0])) as T | undefined) ?? null;
    }
    return null;
  }

  all<T>(sql: string, values: unknown[]): T[] {
    return [...this.operations.values()] as T[];
  }
}

const operation = (status: string): P2POperation => ({
  uuid: "op-1",
  type: "sell",
  status,
  amount: 10,
  receive: 10500,
  currentUserId: "user-1",
  User: { uuid: "user-1", username: "owner" },
});

const finance = (
  feeSource: "unknown" | "qvapay_received",
): FinanceLedgerEntry => ({
  uuid: "op-1",
  status: "completed",
  type: "sell",
  coin: "BANK_CUP",
  amount: 10,
  receive: 10500,
  createdAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T11:00:00.000Z",
  recordedAt: "2026-09-30T10:00:00.000Z",
  grossAmountQusd: 10,
  feeQusd: feeSource === "qvapay_received" ? 0.1 : null,
  netAmountQusd: feeSource === "qvapay_received" ? 9.9 : null,
  feeSource,
});

test("D1 operations upsert is idempotent and preserves recordedAt", async () => {
  const db = new FakeD1();
  const repo = new D1Repository(db);

  await repo.upsertOperations(
    [operation("processing")],
    "2026-09-30T12:00:00.000Z",
  );
  const first = await repo.getOperation("op-1");
  await repo.upsertOperations(
    [operation("completed")],
    "2026-09-30T13:00:00.000Z",
  );
  const second = await repo.getOperation("op-1");

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.recorded_at, "2026-09-30T12:00:00.000Z");
  assert.equal(second?.recorded_at, first.recorded_at);
  assert.equal(second?.status, "completed");
  assert.equal(db.operations.size, 1);
});

test("D1 finance upsert preserves a previously confirmed fee", async () => {
  const db = new FakeD1();
  const repo = new D1Repository(db);

  await repo.upsertOperations([operation("completed")]);
  await repo.upsertFinance([finance("qvapay_received")]);

  const updated = finance("unknown");
  updated.grossAmountQusd = 10;
  updated.feeQusd = null;
  updated.netAmountQusd = null;
  await repo.upsertFinance([updated]);

  const row = await repo.getFinance("op-1");
  assert.equal(row?.fee_source, "qvapay_received");
  assert.equal(row?.fee_qusd, 0.1);
  assert.equal(row?.net_amount_qusd, 9.9);
});

test("D1 applied-offer idempotency does not duplicate an offer", async () => {
  const db = new FakeD1();
  const repo = new D1Repository(db);

  await repo.recordAppliedOffer("offer-1", "2026-09-30T12:00:00.000Z", 10);
  await repo.recordAppliedOffer("offer-1", "2026-09-30T12:01:00.000Z", 10);

  assert.equal(db.applied.size, 1);
  assert.equal(
    db.applied.get("offer-1")?.appliedAt,
    "2026-09-30T12:00:00.000Z",
  );
});
