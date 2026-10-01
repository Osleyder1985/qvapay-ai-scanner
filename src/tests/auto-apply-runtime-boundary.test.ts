/**
 * @file auto-apply-runtime-boundary.test.ts
 * @path src/tests/auto-apply-runtime-boundary.test.ts
 * @description Prueba la separación scheduler/executor utilizada por Auto-Apply.
 * @module tests
 * @status active
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createAutoApplyExecutor,
  type AutoApplyExecutionResult,
} from "../backend/auto-apply-executor.js";
import { createIntervalAutoApplyScheduler } from "../backend/auto-apply-scheduler.js";

test("executor performs one execution without owning a timer", async () => {
  let executions = 0;

  const executor = createAutoApplyExecutor(async () => {
    executions += 1;
    return {
      status: "completed",
      message: "single scan",
    };
  });

  const result = await executor.executeOnce();

  assert.equal(executions, 1);
  assert.equal(result.status, "completed");
  assert.equal(result.message, "single scan");
  assert.match(result.startedAt, /^20/);
  assert.match(result.finishedAt, /^20/);
});

test("executor converts execution failures into durable results", async () => {
  const executor = createAutoApplyExecutor(async () => {
    throw new Error("QvaPay unavailable");
  });

  const result = await executor.executeOnce();

  assert.equal(result.status, "failed");
  assert.equal(result.message, "QvaPay unavailable");
  assert.match(result.startedAt, /^20/);
  assert.match(result.finishedAt, /^20/);
});

test("interval scheduler delegates execution and can be stopped", async () => {
  let executions = 0;
  const result: AutoApplyExecutionResult = {
    status: "completed",
    message: "scheduled",
    startedAt: "",
    finishedAt: "",
  };

  const executor = {
    async executeOnce(): Promise<AutoApplyExecutionResult> {
      executions += 1;
      return result;
    },
  };

  const scheduler = createIntervalAutoApplyScheduler(executor, 5);
  scheduler.start();
  scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  scheduler.stop();
  const stoppedAt = executions;
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.ok(stoppedAt >= 1);
  assert.equal(executions, stoppedAt);
});
