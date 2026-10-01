/**
 * @file operations-ledger.test.ts
 * @path src/tests/operations-ledger.test.ts
 * @description Pruebas unitarias del historial persistente de operaciones y su conciliación.
 * @module tests
 * @status test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OperationsLedgerStore } from "../backend/operations-ledger.js";

test("operations ledger deduplicates UUIDs and preserves recordedAt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qvapay-operations-ledger-"));
  const path = join(dir, "operations.json");
  const previous = process.env.OPERATIONS_LEDGER_PATH;
  process.env.OPERATIONS_LEDGER_PATH = path;

  try {
    const store = new OperationsLedgerStore();
    await store.initialize();
    await store.upsert([{ uuid: "op-1", status: "processing" }]);
    const first = store.list()[0];
    assert.ok(first);
    await store.upsert([{ uuid: "op-1", status: "completed" }]);
    const second = store.list()[0];
    assert.ok(second);
    assert.equal(store.list().length, 1);
    assert.equal(second.recordedAt, first.recordedAt);
    assert.equal(second.status, "completed");

    const persisted = JSON.parse(await readFile(path, "utf8")) as Array<{
      uuid: string;
    }>;
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.uuid, "op-1");
  } finally {
    if (previous === undefined) delete process.env.OPERATIONS_LEDGER_PATH;
    else process.env.OPERATIONS_LEDGER_PATH = previous;
  }
});

test("operations ledger reconciliation identifies missing and stale IDs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qvapay-operations-reconcile-"));
  const path = join(dir, "operations.json");
  const previous = process.env.OPERATIONS_LEDGER_PATH;
  process.env.OPERATIONS_LEDGER_PATH = path;

  try {
    const store = new OperationsLedgerStore();
    await store.initialize();
    await store.upsert([{ uuid: "remote-1" }, { uuid: "stale-local" }]);

    const result = store.reconcile([
      { uuid: "remote-1" },
      { uuid: "remote-2" },
    ]);
    assert.deepEqual(result.missingInLedger, ["remote-2"]);
    assert.deepEqual(result.staleLocal, ["stale-local"]);
  } finally {
    if (previous === undefined) delete process.env.OPERATIONS_LEDGER_PATH;
    else process.env.OPERATIONS_LEDGER_PATH = previous;
  }
});
