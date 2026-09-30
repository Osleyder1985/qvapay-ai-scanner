/**
 * @file dashboard-security.test.ts
 * @path src/tests/dashboard-security.test.ts
 * @description dashboard-security.test.ts source for QvaPay AI Scanner.
 * @module tests
 * @status test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDashboardHostIsSafe, isLoopbackHost } from "../backend/dashboard-security.js";

test("dashboard recognizes supported loopback hosts", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
  assert.equal(isLoopbackHost("192.168.1.10"), false);
});

test("dashboard rejects non-loopback bind addresses", () => {
  assert.doesNotThrow(() => assertDashboardHostIsSafe("127.0.0.1"));
  assert.doesNotThrow(() => assertDashboardHostIsSafe("::1"));
  assert.throws(() => assertDashboardHostIsSafe("0.0.0.0"), /local-only/);
  assert.throws(() => assertDashboardHostIsSafe("192.168.1.10"), /autenticación\/autorización/);
});
