import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AutoApplyEngine, isVipOnlyOffer } from "../backend/auto-apply.js";

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("detects VIP-only offers from boolean and serialized API values", () => {
  assert.equal(isVipOnlyOffer({ only_vip: true }), true);
  assert.equal(isVipOnlyOffer({ only_vip: 1 }), true);
  assert.equal(isVipOnlyOffer({ only_vip: "true" }), true);
  assert.equal(isVipOnlyOffer({ only_vip: "1" }), true);
  assert.equal(isVipOnlyOffer({ only_vip: false }), false);
  assert.equal(isVipOnlyOffer({ only_vip: "false" }), false);
  assert.equal(isVipOnlyOffer({}), false);
});

test("Auto-Apply never sends an application for a VIP-only offer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qvapay-auto-apply-"));
  const configPath = join(directory, "auto-apply.json");
  await writeFile(configPath, JSON.stringify({
    config: {
      enabled: true,
      type: "sell",
      coin: "BANK_CUP",
      rateMin: null,
      rateMax: null,
      amountMin: null,
      amountMax: null,
      dailyMaxQusd: null,
      maxConcurrent: 1,
    },
    state: {
      dailyDate: new Date().toISOString().slice(0, 10),
      dailyAppliedQusd: 0,
      recentApplyAttempts: [],
      appliedOfferIds: [],
      vipRejectedOffers: {},
    },
  }));

  const applied: string[] = [];
  const previousConfigPath = process.env.AUTO_APPLY_CONFIG_PATH;
  process.env.AUTO_APPLY_CONFIG_PATH = configPath;

  const engine = new AutoApplyEngine({
    fetchMarket: async () => response({
      data: [
        {
          uuid: "vip-offer",
          status: "open",
          type: "sell",
          coin: "BANK_CUP",
          amount: 10,
          receive: 10000,
          only_vip: true,
        },
        {
          uuid: "public-offer",
          status: "open",
          type: "sell",
          coin: "BANK_CUP",
          amount: 10,
          receive: 10100,
          only_vip: false,
        },
      ],
    }),
    applyOffer: async (uuid) => {
      applied.push(uuid);
      return response({ ok: true });
    },
    fetchOwnProcessing: async () => response({ data: [] }),
    readPayload: async (upstream) => upstream.json(),
  });

  try {
    await engine.initialize();
    await engine.scan();
    engine.stop();

    assert.deepEqual(applied, ["public-offer"]);
    assert.deepEqual(engine.getStatus().appliedOfferIds, ["public-offer"]);
  } finally {
    engine.stop();
    if (previousConfigPath === undefined) {
      delete process.env.AUTO_APPLY_CONFIG_PATH;
    } else {
      process.env.AUTO_APPLY_CONFIG_PATH = previousConfigPath;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
