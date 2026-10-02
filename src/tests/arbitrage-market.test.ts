/**
 * @file arbitrage-market.test.ts
 * @path src/tests/arbitrage-market.test.ts
 * @description Pruebas deterministas del motor de mercado y oportunidades de arbitraje.
 * @module tests
 * @status test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeArbitrageOffer,
  scanArbitrage,
  type RawArbitrageOffer,
} from "../backend/arbitrage-market.js";

const NOW = new Date("2026-10-02T00:00:00.000Z");

function offer(overrides: Partial<RawArbitrageOffer> = {}): RawArbitrageOffer {
  return {
    uuid: "offer",
    type: "buy",
    coin: "BANK_CUP",
    amount: 10,
    available_amount: 8,
    receive: 1000,
    updated_at: "2026-10-01T23:59:00.000Z",
    ...overrides,
  };
}

test("normaliza una oferta válida sin aplicar sustituciones implícitas", () => {
  const result = normalizeArbitrageOffer(offer());
  assert.deepEqual(result, {
    uuid: "offer",
    side: "buy",
    coin: "BANK_CUP",
    amountQusd: 10,
    availableQusd: 8,
    rate: 100,
    observedAt: "2026-10-01T23:59:00.000Z",
  });
});

test("rechaza una oferta sin liquidez explícita", () => {
  assert.equal(
    normalizeArbitrageOffer(offer({ available_amount: undefined })),
    null,
  );
});

test("rechaza una oferta cuya liquidez supera el monto declarado", () => {
  assert.equal(normalizeArbitrageOffer(offer({ available_amount: 11 })), null);
});

test("empareja únicamente ofertas de la misma moneda", () => {
  const result = scanArbitrage(
    [
      offer({ uuid: "buy-cup", type: "buy", coin: "BANK_CUP", receive: 1000 }),
      offer({ uuid: "sell-usdt", type: "sell", coin: "USDT", receive: 1500 }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 10_000 },
  );
  assert.equal(result.opportunities.length, 0);
});

test("elige BUY más barato y SELL más caro dentro de la misma moneda", () => {
  const result = scanArbitrage(
    [
      offer({ uuid: "buy-expensive", type: "buy", receive: 1200 }),
      offer({ uuid: "buy-cheap", type: "buy", receive: 900 }),
      offer({ uuid: "sell-low", type: "sell", receive: 1300 }),
      offer({ uuid: "sell-high", type: "sell", receive: 1500 }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 10_000 },
  );

  assert.equal(result.opportunities.length, 1);
  const opportunity = result.opportunities[0]!;
  assert.equal(opportunity.buyOfferUuid, "buy-cheap");
  assert.equal(opportunity.sellOfferUuid, "sell-high");
  assert.equal(opportunity.buyRate, 90);
  assert.equal(opportunity.sellRate, 150);
});

test("limita la cantidad por liquidez y capital", () => {
  const result = scanArbitrage(
    [
      offer({
        uuid: "acquire",
        type: "sell",
        amount: 20,
        available_amount: 20,
        receive: 2000,
      }),
      offer({
        uuid: "exit",
        type: "buy",
        amount: 5,
        available_amount: 5,
        receive: 750,
      }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 500 },
  );

  const opportunity = result.opportunities[0]!;
  assert.equal(opportunity.quantityQusd, 5);
  assert.equal(opportunity.capitalRequiredFiat, 500);
  assert.equal(opportunity.grossProfitFiat, 250);
  assert.equal(opportunity.grossMarginPercent, 50);
});

test("calcula beneficio neto sólo cuando ambas comisiones están disponibles", () => {
  const withFees = scanArbitrage(
    [
      offer({
        uuid: "acquire",
        type: "sell",
        available_amount: 10,
        receive: 900,
      }),
      offer({
        uuid: "exit",
        type: "buy",
        available_amount: 10,
        receive: 1000,
      }),
    ],
    {
      now: NOW,
      maxAgeMs: 120_000,
      maxCapitalFiat: 900,
      fees: {
        buy: ({ grossFiat }) => grossFiat * 0.01,
        sell: ({ grossFiat }) => grossFiat * 0.02,
      },
    },
  );

  const opportunity = withFees.opportunities[0]!;
  assert.equal(opportunity.totalFeesFiat, 29);
  assert.equal(opportunity.netProfitFiat, 71);
  assert.equal(opportunity.netMarginPercent, (71 / 900) * 100);

  const withoutFees = scanArbitrage(
    [
      offer({ uuid: "buy", type: "buy", receive: 900 }),
      offer({ uuid: "sell", type: "sell", receive: 1000 }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 900 },
  );
  assert.equal(withoutFees.opportunities[0]!.netProfitFiat, null);
  assert.equal(withoutFees.opportunities[0]!.feesStatus, "unknown");
});

test("rechaza pares con spread cero o negativo", () => {
  const result = scanArbitrage(
    [
      offer({ uuid: "acquire", type: "sell", receive: 1000 }),
      offer({ uuid: "exit", type: "buy", receive: 1000 }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 10_000 },
  );
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.rejected.nonProfitablePairs, 1);
});

test("excluye ofertas obsoletas y ofertas con timestamp futuro", () => {
  const result = scanArbitrage(
    [
      offer({
        uuid: "stale-buy",
        type: "buy",
        updated_at: "2026-10-01T00:00:00.000Z",
      }),
      offer({ uuid: "fresh-sell", type: "sell", receive: 1500 }),
      offer({
        uuid: "future-sell",
        type: "sell",
        receive: 1600,
        updated_at: "2026-10-02T00:01:00.000Z",
      }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 10_000 },
  );

  assert.equal(result.opportunities.length, 0);
  assert.equal(result.rejected.staleOffers, 2);
});

test("separa monedas incluso cuando sus tasas hacen parecer rentable el cruce", () => {
  const result = scanArbitrage(
    [
      offer({ uuid: "buy-1", type: "buy", coin: "BANK_CUP", receive: 900 }),
      offer({ uuid: "sell-2", type: "sell", coin: "ETECSA", receive: 9000 }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 10_000 },
  );
  assert.deepEqual(result.opportunities, []);
});
