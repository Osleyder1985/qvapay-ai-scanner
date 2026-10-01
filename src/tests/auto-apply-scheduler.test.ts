/**
 * @file auto-apply-scheduler.test.ts
 * @path src/tests/auto-apply-scheduler.test.ts
 * @description Prueba la frontera de delegación de eventos programados de Cloudflare.
 * @module tests
 * @status active
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import {
  runScheduledAutoApply,
  type ScheduledExecutionContext,
} from "../backend/cloudflare/auto-apply-scheduler.js";

test("scheduled event delegates exactly one executor execution", async () => {
  let executions = 0;
  const pending: Promise<unknown>[] = [];
  const executor = {
    executeOnce: async () => {
      executions += 1;
      return {
        status: "completed" as const,
        message: "test",
        startedAt: "2026-09-30T00:00:00.000Z",
        finishedAt: "2026-09-30T00:00:01.000Z",
      };
    },
  };

  const context: ScheduledExecutionContext = {
    waitUntil(promise) {
      pending.push(promise);
    },
  };

  await runScheduledAutoApply(executor, context);
  assert.equal(executions, 1);
  assert.equal(pending.length, 1);
  await pending[0];
  assert.equal(executions, 1);
});

test("scheduler boundary does not invoke the executor synchronously outside waitUntil", async () => {
  let executions = 0;
  const executor = {
    executeOnce: async () => {
      executions += 1;
      return {
        status: "completed" as const,
        message: "test",
        startedAt: "2026-09-30T00:00:00.000Z",
        finishedAt: "2026-09-30T00:00:01.000Z",
      };
    },
  };

  let captured: Promise<unknown> | null = null;
  await runScheduledAutoApply(executor, {
    waitUntil(promise) {
      captured = promise;
    },
  });

  assert.equal(executions, 1);
  assert.ok(captured);
  await captured;
});
