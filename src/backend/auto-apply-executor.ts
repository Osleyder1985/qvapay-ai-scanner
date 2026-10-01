/**
 * @file auto-apply-executor.ts
 * @path src/backend/auto-apply-executor.ts
 * @description Define la frontera de ejecución de Auto-Apply independiente del runtime.
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
 * Contrato para una ejecución durable de Auto-Apply.
 *
 * Las implementaciones deben realizar como máximo un ciclo de escaneo/acción y no deben
 * create timers or depend on process-local scheduling state.
 */
export interface AutoApplyExecutor {
  executeOnce(): Promise<AutoApplyExecutionResult>;
}

/**
 * Crea un executor a partir de una función de ciclo único.
 *
 * El objeto devuelto no contiene temporizador y, por tanto, puede ser invocado por
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
