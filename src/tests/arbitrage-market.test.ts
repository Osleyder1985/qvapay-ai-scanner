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
    offerKind: "flexible",
    orderMinQusd: null,
    orderMaxQusd: null,
    observedAt: "2026-10-01T23:59:00.000Z",
  });
});


test("usa el monto completo de una oferta fija cuando available_amount es null", () => {
  const result = normalizeArbitrageOffer(
    offer({
      type: "sell",
      amount: 10,
      available_amount: null,
      receive: 1000,
      offer_kind: "fixed",
    }),
  );

  assert.equal(result?.offerKind, "fixed");
  assert.equal(result?.availableQusd, 10);
});

test("respeta los límites de orden de ofertas flexibles", () => {
  const result = scanArbitrage(
    [
      offer({
        uuid: "acquire",
        type: "sell",
        amount: 100,
        available_amount: 100,
        receive: 9000,
        offer_kind: "flexible",
        order_min: 25,
        order_max: 60,
      }),
      offer({
        uuid: "exit",
        type: "buy",
        amount: 100,
        available_amount: 100,
        receive: 10000,
        offer_kind: "flexible",
        order_min: 30,
        order_max: 50,
      }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 10_000 },
  );

  assert.equal(result.opportunities[0]?.quantityQusd, 50);
});

test("rechaza una oportunidad cuando el capital no alcanza el mínimo de ambas órdenes", () => {
  const result = scanArbitrage(
    [
      offer({
        uuid: "acquire",
        type: "sell",
        amount: 100,
        available_amount: 100,
        receive: 9000,
        offer_kind: "flexible",
        order_min: 50,
      }),
      offer({
        uuid: "exit",
        type: "buy",
        amount: 100,
        available_amount: 100,
        receive: 10000,
        offer_kind: "flexible",
        order_min: 50,
      }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 450 },
  );

  assert.equal(result.opportunities.length, 0);
  assert.equal(result.rejected.insufficientLiquidity, 1);
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

test("elige la adquisición SELL más barata y la salida BUY más cara dentro de la misma moneda", () => {
  const result = scanArbitrage(
    [
      offer({ uuid: "acquire-expensive", type: "sell", receive: 1200 }),
      offer({ uuid: "acquire-cheap", type: "sell", receive: 900 }),
      offer({ uuid: "exit-low", type: "buy", receive: 1300 }),
      offer({ uuid: "exit-high", type: "buy", receive: 1500 }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 10_000 },
  );

  assert.equal(result.opportunities.length, 1);
  const opportunity = result.opportunities[0]!;
  assert.equal(opportunity.acquisitionOfferUuid, "acquire-cheap");
  assert.equal(opportunity.exitOfferUuid, "exit-high");
  assert.equal(opportunity.buyRate, 90);
  assert.equal(opportunity.sellRate, 150);
  assert.equal(opportunity.buyOfferUuid, opportunity.acquisitionOfferUuid);
  assert.equal(opportunity.sellOfferUuid, opportunity.exitOfferUuid);
});

test("elige el par que maximiza el beneficio con liquidez limitada", () => {
  const result = scanArbitrage(
    [
      offer({
        uuid: "acquire-cheap-small",
        type: "sell",
        amount: 2,
        available_amount: 2,
        receive: 180,
      }),
      offer({
        uuid: "acquire-mid-large",
        type: "sell",
        amount: 10,
        available_amount: 10,
        receive: 1000,
      }),
      offer({
        uuid: "exit-high-small",
        type: "buy",
        amount: 2,
        available_amount: 2,
        receive: 260,
      }),
      offer({
        uuid: "exit-mid-large",
        type: "buy",
        amount: 10,
        available_amount: 10,
        receive: 1200,
      }),
    ],
    { now: NOW, maxAgeMs: 120_000, maxCapitalFiat: 2_000 },
  );

  const opportunity = result.opportunities[0]!;
  assert.equal(opportunity.acquisitionOfferUuid, "acquire-mid-large");
  assert.equal(opportunity.exitOfferUuid, "exit-mid-large");
  assert.equal(opportunity.quantityQusd, 10);
  assert.equal(opportunity.grossProfitFiat, 200);
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
      offer({ uuid: "acquire", type: "sell", receive: 900 }),
      offer({ uuid: "exit", type: "buy", receive: 1000 }),
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
