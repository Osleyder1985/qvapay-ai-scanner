/**
 * @file auto-apply-runtime.ts
 * @path src/worker/auto-apply-runtime.ts
 * @description Cloudflare Worker composition boundary for scheduled Auto-Apply.
 * @module worker
 * @status migration
 */

import {
  createCloudflareAutoApplyExecutor,
  type CloudflareAutoApplyDependencies,
} from "../backend/cloudflare/cloudflare-auto-apply-executor.js";
import { D1Repository, type D1DatabaseLike } from "../backend/cloudflare/d1-repository.js";
import { createQvaPayClient, type QvaPayClientConfig } from "../backend/cloudflare/qvapay-client.js";
import { createScheduledHandler } from "./scheduler.js";

export interface CloudflareAutoApplyRuntimeEnv {
  DB: D1DatabaseLike;
  QVAPAY_APP_ID?: string;
  QVAPAY_APP_SECRET?: string;
  QVAPAY_BASE_URL?: string;
  AUTO_APPLY_RUNTIME_ENABLED?: string;
}

export interface AutoApplyRuntimeDependencies {
  createQvaPayClient?: typeof createQvaPayClient;
  createExecutor?: typeof createCloudflareAutoApplyExecutor;
}

/**
 * The runtime is fail-closed: only the literal string "true" enables the
 * scheduled Auto-Apply composition. The default is disabled.
 */
export function isAutoApplyRuntimeEnabled(
  env: CloudflareAutoApplyRuntimeEnv,
): boolean {
  return env.AUTO_APPLY_RUNTIME_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Creates the Worker scheduled handler without configuring a Cron trigger.
 * Missing credentials also fail closed and therefore cannot cause a mutation.
 */
export function createAutoApplyScheduledHandler(
  env: CloudflareAutoApplyRuntimeEnv,
  dependencies: AutoApplyRuntimeDependencies = {},
) {
  const createClient = dependencies.createQvaPayClient ?? createQvaPayClient;
  const createExecutor =
    dependencies.createExecutor ?? createCloudflareAutoApplyExecutor;

  return async (
    controller: { scheduledTime: number },
    _scheduledEnv: unknown,
    context: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<void> => {
    if (!isAutoApplyRuntimeEnabled(env)) return;

    const appId = env.QVAPAY_APP_ID?.trim();
    const appSecret = env.QVAPAY_APP_SECRET?.trim();
    if (!appId || !appSecret) return;

    const repository = new D1Repository(env.DB);
    const qvapayConfig: QvaPayClientConfig = {
      appId,
      appSecret,
      baseUrl: env.QVAPAY_BASE_URL,
    };
    const qvapay = createClient(qvapayConfig);
    const executor = createExecutor({
      repository,
      qvapay,
    } as CloudflareAutoApplyDependencies);

    await createScheduledHandler({ executor })(controller, env, context);
  };
}
