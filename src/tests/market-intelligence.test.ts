import test from "node:test";
import assert from "node:assert/strict";
import { calculateMarketIntelligence } from "../backend/market-intelligence.js";

test("calculates market rate statistics from real offer fields", () => {
  const result=calculateMarketIntelligence([
    {uuid:"a",type:"sell",coin:"BANK_CUP",amount:10,receive:1000,status:"open",User:{kyc:true,rating_avg:5}},
    {uuid:"b",type:"sell",coin:"BANK_CUP",amount:10,receive:900,status:"open"},
    {uuid:"c",type:"buy",coin:"USDT",amount:5,receive:500,status:"open"}
  ]);
  assert.equal(result.sampleSize,3);
  assert.equal(result.validRates,3);
  assert.equal(result.bestRate,100);
  assert.equal(result.minRate,90);
  assert.equal(result.medianRate,100);
  assert.equal(result.sellCount,2);
  assert.equal(result.buyCount,1);
  assert.equal(result.coins.length,2);
  assert.equal(result.opportunities[0]?.uuid,"a");
});

test("ignores offers with invalid amount or receive values", () => {
  const result=calculateMarketIntelligence([
    {uuid:"bad-amount",amount:0,receive:100},
    {uuid:"bad-receive",amount:10,receive:"x"},
    {uuid:"valid",type:"sell",coin:"BANK_CUP",amount:10,receive:1000}
  ]);
  assert.equal(result.validRates,1);
  assert.equal(result.bestRate,100);
});
