/**
 * @file cloudflare-auto-apply-executor.test.ts
 * @path src/tests/cloudflare-auto-apply-executor.test.ts
 * @description Tests lease, idempotency and mutation policy of the Cloudflare executor.
 * @module tests
 * @status active
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { createCloudflareAutoApplyExecutor } from "../backend/cloudflare/cloudflare-auto-apply-executor.js";
import type { D1AutoApplyConfigRow } from "../backend/cloudflare/d1-repository.js";
import type { QvaPayHttpResult } from "../backend/cloudflare/qvapay-client.js";

function dependencies(overrides: Record<string, unknown> = {}) {
  let applied = 0;
  let released = 0;
  let attempts = 0;
  let stateMessage = "";

  const repository = {
    getAutoApplyConfig: async (): Promise<D1AutoApplyConfigRow> => ({
      id: 1 as const,
      enabled: 1,
      type: "sell" as const,
      coin: "USDT",
      rate_min: 1000,
      rate_max: 1100,
      amount_min: 10,
      amount_max: 100,
      daily_max_qusd: 100,
      max_concurrent: 1,
      updated_at: "2026-09-30T00:00:00.000Z",
    }),
    getAutoApplyState: async () => ({
      id: 1 as const,
      daily_date: "2026-09-30",
      daily_applied_qusd: 0,
      last_scan_at: null,
      last_action_at: null,
      last_message: "",
      updated_at: "2026-09-30T00:00:00.000Z",
    }),
    hasAppliedOffer: async () => false,
    updateAutoApplyState: async (input: { lastMessage: string }) => {
      stateMessage = input.lastMessage;
    },
    claimAutoApplyExecutionLease: async () =>
      overrides.claimed === undefined ? true : Boolean(overrides.claimed),
    releaseAutoApplyExecutionLease: async () => {
      released += 1;
      return true;
    },
    recordAutoApplyAttempt: async () => {
      attempts += 1;
    },
    recordAppliedOffer: async () => {
      applied += 1;
    },
    recordVipRejection: async () => {},
  };

  const qvapay = {
    getOwnP2P: async (): Promise<QvaPayHttpResult> =>
      (overrides.own as QvaPayHttpResult | undefined) ?? {
        status: 200,
        ok: true,
        payload: { data: [] },
        headers: new Headers(),
      },
    getP2P: async (): Promise<QvaPayHttpResult> =>
      (overrides.market as QvaPayHttpResult | undefined) ?? {
        status: 200,
        ok: true,
        payload: {
          data: [
            {
              uuid: "offer-1",
              status: "open",
              type: "sell",
              coin: "USDT",
              amount: 25,
              receive: 26250,
              only_vip: false,
            },
          ],
        },
        headers: new Headers(),
      },
    applyP2POffer: async (): Promise<QvaPayHttpResult> => {
      const response =
        (overrides.apply as QvaPayHttpResult | undefined) ?? {
          status: 200,
          ok: true,
          payload: { message: "accepted" },
          headers: new Headers(),
        };
      if (response.ok) applied += 100;
      return response;
    },
  };

  return {
    repository,
    qvapay,
    counters: () => ({ applied, released, attempts, stateMessage }),
  };
}

test("disabled configuration never calls QvaPay mutation", async () => {
  const deps = dependencies();
  deps.repository.getAutoApplyConfig =
    async (): Promise<D1AutoApplyConfigRow> => ({
      id: 1,
      enabled: 0,
      type: "sell",
      coin: "USDT",
      rate_min: null,
      rate_max: null,
      amount_min: null,
      amount_max: null,
      daily_max_qusd: null,
      max_concurrent: 1,
      updated_at: "2026-09-30T00:00:00.000Z",
    });
  let mutationCalls = 0;
  deps.qvapay.applyP2POffer = async () => {
    mutationCalls += 1;
    throw new Error("mutation must not run");
  };

  const executor = createCloudflareAutoApplyExecutor({
    repository: deps.repository,
    qvapay: deps.qvapay,
    ownerId: () => "test-run",
  });
  const result = await executor.executeOnce();

  assert.equal(result.status, "disabled");
  assert.equal(mutationCalls, 0);
});

test("lease conflict skips the execution before market mutation", async () => {
  const deps = dependencies({ claimed: false });
  let marketCalls = 0;
  deps.qvapay.getP2P = async () => {
    marketCalls += 1;
    throw new Error("market must not run");
  };

  const executor = createCloudflareAutoApplyExecutor({
    repository: deps.repository,
    qvapay: deps.qvapay,
    ownerId: () => "contended-run",
  });
  const result = await executor.executeOnce();

  assert.equal(result.status, "skipped");
  assert.equal(marketCalls, 0);
  assert.equal(deps.counters().released, 0);
});

test("eligible offer is applied once and persisted as idempotent", async () => {
  const deps = dependencies();
  const executor = createCloudflareAutoApplyExecutor({
    repository: deps.repository,
    qvapay: deps.qvapay,
    ownerId: () => "success-run",
  });
  const result = await executor.executeOnce();

  assert.equal(result.status, "completed");
  assert.equal(deps.counters().attempts, 1);
  assert.equal(deps.counters().applied, 101);
  assert.equal(deps.counters().released, 1);
  assert.match(deps.counters().stateMessage, /accepted automatically/);
});

test("VIP rejection is recorded and does not count as an applied offer", async () => {
  const deps = dependencies({
    apply: {
      status: 400,
      ok: false,
      payload: { message: "No tienes VIP para aplicar a esta oferta" },
      headers: new Headers(),
    },
  });
  const executor = createCloudflareAutoApplyExecutor({
    repository: deps.repository,
    qvapay: deps.qvapay,
    ownerId: () => "vip-run",
  });
  const result = await executor.executeOnce();

  assert.equal(result.status, "completed");
  assert.equal(deps.counters().attempts, 1);
  assert.equal(deps.counters().released, 1);
  assert.equal(deps.counters().applied, 0);
});
