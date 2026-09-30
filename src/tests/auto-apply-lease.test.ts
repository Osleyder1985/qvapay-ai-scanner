/**
 * @file auto-apply-lease.test.ts
 * @path src/tests/auto-apply-lease.test.ts
 * @description Tests the durable Auto-Apply execution lease boundary.
 * @module tests
 * @status migration
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { D1Repository, type D1DatabaseLike } from "../backend/cloudflare/d1-repository.js";

function createDb() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    db: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...input: unknown[]) { values = input; return this; },
          async run() {
            if (sql.includes("INSERT OR IGNORE INTO auto_apply_execution_lease")) {
              if (!rows.has("1")) rows.set("1", { owner_id: null, expires_at: null });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE auto_apply_execution_lease") && sql.includes("owner_id = ?") && sql.includes("expires_at <= ?")) {
              const row = rows.get("1");
              const ownerId = String(values[0]);
              const expiresAt = String(values[2]);
              const now = String(values[4]);
              const available = !row?.owner_id || !row.expires_at || String(row.expires_at) <= now;
              if (!available) return { success: true, meta: { changes: 0 } };
              rows.set("1", { owner_id: ownerId, expires_at: expiresAt });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE auto_apply_execution_lease") && sql.includes("owner_id = ?")) {
              const row = rows.get("1");
              const ownerId = String(values[1]);
              if (!row || row.owner_id !== ownerId) return { success: true, meta: { changes: 0 } };
              rows.set("1", { owner_id: null, expires_at: null });
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 1 } };
          },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: [] as T[] }; },
        };
      },
    } as D1DatabaseLike,
  };
}

test("Auto-Apply lease rejects a second owner while the lease is active", async () => {
  const { db } = createDb();
  const repository = new D1Repository(db);
  assert.equal(await repository.claimAutoApplyExecutionLease({ ownerId: "run-a", acquiredAt: "2026-09-30T10:00:00Z", expiresAt: "2026-09-30T10:01:00Z", now: "2026-09-30T10:00:00Z" }), true);
  assert.equal(await repository.claimAutoApplyExecutionLease({ ownerId: "run-b", acquiredAt: "2026-09-30T10:00:10Z", expiresAt: "2026-09-30T10:01:10Z", now: "2026-09-30T10:00:10Z" }), false);
});

test("expired Auto-Apply lease can be recovered", async () => {
  const { db } = createDb();
  const repository = new D1Repository(db);
  assert.equal(await repository.claimAutoApplyExecutionLease({ ownerId: "run-a", acquiredAt: "2026-09-30T10:00:00Z", expiresAt: "2026-09-30T10:01:00Z", now: "2026-09-30T10:00:00Z" }), true);
  assert.equal(await repository.claimAutoApplyExecutionLease({ ownerId: "run-b", acquiredAt: "2026-09-30T10:02:00Z", expiresAt: "2026-09-30T10:03:00Z", now: "2026-09-30T10:02:00Z" }), true);
});

test("Auto-Apply lease release is owner-scoped", async () => {
  const { db } = createDb();
  const repository = new D1Repository(db);
  assert.equal(await repository.claimAutoApplyExecutionLease({ ownerId: "run-a", acquiredAt: "2026-09-30T10:00:00Z", expiresAt: "2026-09-30T10:01:00Z", now: "2026-09-30T10:00:00Z" }), true);
  assert.equal(await repository.releaseAutoApplyExecutionLease("run-b", "2026-09-30T10:00:30Z"), false);
  assert.equal(await repository.releaseAutoApplyExecutionLease("run-a", "2026-09-30T10:00:40Z"), true);
});
