/**
 * @file market-snapshot.test.ts
 * @path src/tests/market-snapshot.test.ts
 * @description Cobertura de pruebas para market-snapshot.test.ts en QvaPay AI Scanner.
 * @module tests
 * @status test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MarketSnapshotService } from "../backend/market-snapshot.js";

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("market snapshot deduplicates concurrent identical requests", async () => {
  const service = new MarketSnapshotService({
    cacheTtlMs: 60_000,
    minIntervalMs: 0,
  });
  let calls = 0;
  const url = new URL("https://api.qvapay.com/p2p?take=100&page=1");
  const fetcher = async () => {
    calls += 1;
    return response({ data: [1] });
  };
  const [a, b] = await Promise.all([
    service.fetch(url, fetcher),
    service.fetch(url, fetcher),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(await a.json(), { data: [1] });
  assert.deepEqual(await b.json(), { data: [1] });
});

test("market snapshot caches successful responses", async () => {
  const service = new MarketSnapshotService({
    cacheTtlMs: 60_000,
    minIntervalMs: 0,
  });
  let calls = 0;
  const url = new URL("https://api.qvapay.com/p2p?take=100&page=1");
  const fetcher = async () => {
    calls += 1;
    return response({ value: calls });
  };
  const first = await service.fetch(url, fetcher);
  const second = await service.fetch(url, fetcher);
  assert.deepEqual(await first.json(), { value: 1 });
  assert.deepEqual(await second.json(), { value: 1 });
  assert.equal(calls, 1);
  assert.equal(service.getStats().cacheHits, 1);
});

test("market snapshot does not cache failed responses", async () => {
  const service = new MarketSnapshotService({
    cacheTtlMs: 60_000,
    minIntervalMs: 0,
  });
  let calls = 0;
  const url = new URL("https://api.qvapay.com/p2p?take=100&page=1");
  const fetcher = async () => {
    calls += 1;
    return response({ error: "limited" }, 429);
  };
  await service.fetch(url, fetcher);
  await service.fetch(url, fetcher);
  assert.equal(calls, 2);
});
