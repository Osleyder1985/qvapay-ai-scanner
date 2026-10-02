/**
 * @file finance-ledger.test.ts
 * @path src/tests/finance-ledger.test.ts
 * @description Pruebas del ledger financiero de QvaPay AI Scanner.
 * @module tests
 * @status test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FinanceLedgerStore } from "../backend/finance-ledger.js";

test("finance ledger persists completed operations idempotently", async () => {
  const dir = await mkdtemp(join(process.cwd(), "tmp-finance-"));
  const path = join(dir, "ledger.json");
  const previous = process.env.FINANCE_LEDGER_PATH;
  process.env.FINANCE_LEDGER_PATH = path;
  try {
    const first = new FinanceLedgerStore();
    await first.initialize();
    assert.equal(
      await first.upsert([
        {
          uuid: "b1",
          status: "completed",
          type: "buy",
          coin: "BANK_CUP",
          amount: 10,
          receive: 100,
        },
      ]),
      1,
    );
    assert.equal(
      await first.upsert([
        {
          uuid: "b1",
          status: "completed",
          type: "buy",
          coin: "BANK_CUP",
          amount: 10,
          receive: 100,
        },
      ]),
      0,
    );
    const second = new FinanceLedgerStore();
    await second.initialize();
    assert.equal(second.list().length, 1);
    assert.equal(JSON.parse(await readFile(path, "utf8")).length, 1);
  } finally {
    if (previous === undefined) delete process.env.FINANCE_LEDGER_PATH;
    else process.env.FINANCE_LEDGER_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("finance ledger rejects inconsistent settlements", async () => {
  const dir = await mkdtemp(join(process.cwd(), "tmp-finance-settlement-"));
  const path = join(dir, "ledger.json");
  const previous = process.env.FINANCE_LEDGER_PATH;
  process.env.FINANCE_LEDGER_PATH = path;
  try {
    const store = new FinanceLedgerStore();
    await store.upsert([
      {
        uuid: "s1",
        status: "completed",
        type: "buy",
        coin: "BANK_CUP",
        amount: 10,
        receive: 100,
      },
    ]);

    assert.equal(
      await store.recordSettlement("s1", {
        gross_amount: 100,
        fee: 101,
        amount: 0,
      }),
      false,
    );
    assert.equal(
      await store.recordSettlement("s1", {
        gross_amount: 100,
        fee: 10,
        amount: 80,
      }),
      false,
    );
    assert.equal(
      await store.recordSettlement("s1", {
        gross_amount: 100,
        fee: 0.1,
        amount: 99.9,
      }),
      true,
    );
  } finally {
    if (previous === undefined) delete process.env.FINANCE_LEDGER_PATH;
    else process.env.FINANCE_LEDGER_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("finance ledger neutralizes malformed persisted settlement values", async () => {
  const dir = await mkdtemp(join(process.cwd(), "tmp-finance-loaded-"));
  const path = join(dir, "ledger.json");
  const previous = process.env.FINANCE_LEDGER_PATH;
  process.env.FINANCE_LEDGER_PATH = path;
  try {
    await writeFile(
      path,
      JSON.stringify([
        {
          uuid: "loaded-1",
          status: "completed",
          type: "buy",
          coin: "BANK_CUP",
          amount: 10,
          receive: 100,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
          recordedAt: "2026-10-01T00:00:00.000Z",
          grossAmountQusd: 100,
          feeQusd: 20,
          netAmountQusd: 70,
          feeSource: "qvapay_received",
        },
      ]),
      "utf8",
    );
    const store = new FinanceLedgerStore();
    await store.initialize();
    const entry = store.list()[0];
    assert.ok(entry);
    assert.equal(entry.grossAmountQusd, 10);
    assert.equal(entry.feeQusd, null);
    assert.equal(entry.netAmountQusd, null);
    assert.equal(entry.feeSource, "unknown");

    await writeFile(
      path,
      JSON.stringify([
        {
          uuid: "loaded-2",
          status: "completed",
          type: "buy",
          coin: "BANK_CUP",
          amount: 10,
          receive: 100,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
          recordedAt: "2026-10-01T00:00:00.000Z",
          grossAmountQusd: 100,
          feeQusd: null,
          netAmountQusd: 100,
          feeSource: "qvapay_received",
        },
      ]),
      "utf8",
    );
    const partial = new FinanceLedgerStore();
    await partial.initialize();
    const partialEntry = partial.list()[0];
    assert.ok(partialEntry);
    assert.equal(partialEntry.grossAmountQusd, 10);
    assert.equal(partialEntry.feeQusd, null);
    assert.equal(partialEntry.netAmountQusd, null);
    assert.equal(partialEntry.feeSource, "unknown");
  } finally {
    if (previous === undefined) delete process.env.FINANCE_LEDGER_PATH;
    else process.env.FINANCE_LEDGER_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

