/**
 * @file auto-apply-scheduler.ts
 * @path src/backend/cloudflare/auto-apply-scheduler.ts
 * @description Cloudflare scheduled-event boundary for one-shot Auto-Apply.
 * @module backend/cloudflare
 * @status migration
 */

import type { AutoApplyExecutor } from "../auto-apply-executor.js";

export interface ScheduledExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Delegates one scheduled event to one executor invocation.
 * It deliberately contains no timer, loop, or business rule.
 */
export async function runScheduledAutoApply(
  executor: AutoApplyExecutor,
  context: ScheduledExecutionContext,
): Promise<void> {
  context.waitUntil(executor.executeOnce());
}
