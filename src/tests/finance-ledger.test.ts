/**
 * @file finance-ledger.test.ts
 * @path src/tests/finance-ledger.test.ts
 * @description Pruebas del ledger financiero de QvaPay AI Scanner.
 * @module tests
 * @status test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
