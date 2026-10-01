/**
 * @file auto-apply-scheduler.ts
 * @path src/backend/auto-apply-scheduler.ts
 * @description Define un scheduler intercambiable para la ejecución de Auto-Apply.
 * @module backend
 * @status active
 */

import type { AutoApplyExecutor } from "./auto-apply-executor.js";

export interface AutoApplyScheduler {
  start(): void;
  stop(): void;
}

/**
 * Crea un scheduler local al proceso para el runtime Node.
 *
 * Este adaptador existe únicamente por compatibilidad con el runtime actual.
 * Cloudflare debe invocar el executor directamente desde Cron o Workflows.
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
