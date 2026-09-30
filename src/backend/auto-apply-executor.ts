/**
 * @file auto-apply-executor.ts
 * @path src/backend/auto-apply-executor.ts
 * @description Defines the runtime-independent Auto-Apply execution boundary.
 * @module backend
 * @status active
 */

export interface AutoApplyExecutionResult {
  status: "disabled" | "skipped" | "completed" | "failed";
  message: string;
  startedAt: string;
  finishedAt: string;
}

/**
 * Contract for one durable Auto-Apply execution.
 *
 * Implementations must perform at most one scan/action cycle and must not
 * create timers or depend on process-local scheduling state.
 */
export interface AutoApplyExecutor {
  executeOnce(): Promise<AutoApplyExecutionResult>;
}

/**
 * Creates an executor from a single-cycle function.
 *
 * The returned object contains no timer and can therefore be invoked by
 * Node, Cron, Workflows, or another external scheduler.
 */
export function createAutoApplyExecutor(
  execute: () => Promise<
    Omit<AutoApplyExecutionResult, "startedAt" | "finishedAt">
  >,
): AutoApplyExecutor {
  return {
    async executeOnce(): Promise<AutoApplyExecutionResult> {
      const startedAt = new Date().toISOString();

      try {
        const result = await execute();
        return {
          ...result,
          startedAt,
          finishedAt: new Date().toISOString(),
        };
      } catch (error) {
        return {
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
          startedAt,
          finishedAt: new Date().toISOString(),
        };
      }
    },
  };
}
