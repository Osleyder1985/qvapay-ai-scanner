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


test("keeps intelligence independent for each currency", () => {
  const result=calculateMarketIntelligence([
    {uuid:"cup-1",type:"sell",coin:"BANK_CUP",amount:10,receive:10000,status:"open"},
    {uuid:"cup-2",type:"sell",coin:"BANK_CUP",amount:10,receive:9000,status:"open"},
    {uuid:"mlc-1",type:"sell",coin:"BANK_MLC",amount:10,receive:120,status:"open"},
    {uuid:"mlc-2",type:"buy",coin:"BANK_MLC",amount:10,receive:100,status:"open"}
  ]);
  assert.equal(result.sampleSize,4);
  assert.equal(result.byCoin.length,2);

  const cup=result.byCoin.find(g=>g.coin==="BANK_CUP");
  const mlc=result.byCoin.find(g=>g.coin==="BANK_MLC");

  assert.equal(cup?.sampleSize,2);
  assert.equal(cup?.bestRate,1000);
  assert.equal(cup?.medianRate,950);
  assert.equal(mlc?.sampleSize,2);
  assert.equal(mlc?.bestRate,12);
  assert.equal(mlc?.medianRate,11);
});
