/**
 * @file auto-apply-runtime.test.ts
 * @path src/tests/auto-apply-runtime.test.ts
 * @description Tests the Cloudflare Auto-Apply runtime composition kill switch and credential boundary.
 * @module tests
 * @status active
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createAutoApplyScheduledHandler,
  isAutoApplyRuntimeEnabled,
} from "../worker/auto-apply-runtime.js";

const env = {
  DB: {
    prepare: () => {
      throw new Error("D1 must not be touched by this test");
    },
  },
};

test("Auto-Apply runtime is disabled unless explicitly enabled", () => {
  assert.equal(isAutoApplyRuntimeEnabled(env), false);
  assert.equal(
    isAutoApplyRuntimeEnabled({ ...env, AUTO_APPLY_RUNTIME_ENABLED: "TRUE" }),
    true,
  );
});

test("disabled runtime does not construct QvaPay client or executor", async () => {
  let clientCalls = 0;
  let executorCalls = 0;

  const handler = createAutoApplyScheduledHandler(env, {
    createQvaPayClient: () => {
      clientCalls += 1;
      throw new Error("client must not be constructed");
    },
    createExecutor: () => {
      executorCalls += 1;
      throw new Error("executor must not be constructed");
    },
  });

  const pending: Promise<unknown>[] = [];
  await handler({ scheduledTime: Date.now() }, env, {
    waitUntil: (promise) => pending.push(promise),
  });

  assert.equal(clientCalls, 0);
  assert.equal(executorCalls, 0);
  assert.equal(pending.length, 0);
});

test("enabled runtime fails closed when QvaPay credentials are absent", async () => {
  let clientCalls = 0;
  const handler = createAutoApplyScheduledHandler(
    { ...env, AUTO_APPLY_RUNTIME_ENABLED: "true" },
    {
      createQvaPayClient: () => {
        clientCalls += 1;
        throw new Error("client must not be constructed");
      },
    },
  );

  await handler({ scheduledTime: Date.now() }, env, { waitUntil: () => {} });

  assert.equal(clientCalls, 0);
});

test("enabled runtime composes the executor and delegates through waitUntil", async () => {
  let executorFactoryCalls = 0;
  let executions = 0;
  const pending: Promise<unknown>[] = [];

  const handler = createAutoApplyScheduledHandler(
    {
      ...env,
      AUTO_APPLY_RUNTIME_ENABLED: "true",
      QVAPAY_APP_ID: "test-app",
      QVAPAY_APP_SECRET: "test-secret",
    },
    {
      createQvaPayClient: () => ({
        getP2P: async () => ({
          status: 200,
          ok: true,
          payload: { data: [] },
          headers: new Headers(),
        }),
        getOwnP2P: async () => ({
          status: 200,
          ok: true,
          payload: { data: [] },
          headers: new Headers(),
        }),
        applyP2POffer: async () => ({
          status: 200,
          ok: true,
          payload: null,
          headers: new Headers(),
        }),
      }),
      createExecutor: () => {
        executorFactoryCalls += 1;
        return {
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
      },
    },
  );

  await handler({ scheduledTime: Date.now() }, env, {
    waitUntil: (promise) => pending.push(promise),
  });

  assert.equal(executorFactoryCalls, 1);
  assert.equal(executions, 1);
  assert.equal(pending.length, 1);
  await pending[0];
  assert.equal(executions, 1);
});
