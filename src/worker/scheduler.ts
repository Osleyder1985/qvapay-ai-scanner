/**
 * @file scheduler.ts
 * @path src/worker/scheduler.ts
 * @description Dependency-injection boundary for Cloudflare scheduled events.
 * @module worker
 * @status migration
 */

import { runScheduledAutoApply } from "../backend/cloudflare/auto-apply-scheduler.js";
import type { AutoApplyExecutor } from "../backend/auto-apply-executor.js";

export interface SchedulerDependencies {
  executor: AutoApplyExecutor;
}

/**
 * Worker scheduled handler factory. Production wiring is intentionally kept
 * outside this module until D1 and Secrets are configured.
 */
export function createScheduledHandler(dependencies: SchedulerDependencies) {
  return async (
    _controller: ScheduledController,
    _env: unknown,
    context: ExecutionContext,
  ): Promise<void> => {
    await runScheduledAutoApply(dependencies.executor, {
      waitUntil: (promise) => context.waitUntil(promise),
    });
  };
}
