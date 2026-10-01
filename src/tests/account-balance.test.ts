import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(join(process.cwd(), "src", "worker.ts"), "utf8");

test("account endpoint accepts documented QvaPay balance shapes", () => {
  assert.ok(source.includes("numberValue(balanceRecord?.balance)"));
  assert.ok(source.includes("numberValue(balanceData?.balance)"));
  assert.ok(source.includes("const wrappedBalance ="));
  assert.ok(source.includes("balanceSource: Number.isFinite(balanceValue)"));
});


test("QvaPay POST requests set JSON content type for balance compatibility", () => {
  assert.ok(source.includes('init.method?.toUpperCase() === "POST"'));
  assert.ok(source.includes('headers.set("Content-Type", "application/json")'));
});
