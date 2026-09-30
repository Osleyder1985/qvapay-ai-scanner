/**
 * @file auto-apply-scheduler.ts
 * @path src/backend/auto-apply-scheduler.ts
 * @description Defines an interchangeable scheduler for Auto-Apply execution.
 * @module backend
 * @status active
 */

import type { AutoApplyExecutor } from "./auto-apply-executor.js";

export interface AutoApplyScheduler {
  start(): void;
  stop(): void;
}

/**
 * Creates a process-local scheduler for the Node runtime.
 *
 * This adapter exists only for compatibility with the current runtime.
 * Cloudflare should invoke the executor directly from Cron or Workflows.
 */
export function createIntervalAutoApplyScheduler(
  executor: AutoApplyExecutor,
  intervalMs: number,
): AutoApplyScheduler {
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start(): void {
      if (timer !== null) return;
      timer = setInterval(() => {
        void executor.executeOnce();
      }, intervalMs);
    },

    stop(): void {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
