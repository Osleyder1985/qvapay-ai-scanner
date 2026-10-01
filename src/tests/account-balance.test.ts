import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(join(process.cwd(), "src", "worker.ts"), "utf8");

test("account endpoint reads the documented QvaPay balance field", () => {
  assert.match(source, /numberValue\(balanceRecord\?\.balance\)/);
  assert.match(source, /balanceSource: Number\.isFinite\(balanceValue\)/);
});

test("account endpoint also accepts a standard wrapped data.balance response", () => {
  assert.match(source, /numberValue\(balanceData\?\.balance\)/);
  assert.match(source, /const wrappedBalance = numberValue\(balanceData\?\.balance\)/);
});
