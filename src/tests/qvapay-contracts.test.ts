import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  finiteNonNegativeNumber,
  finiteNumber,
  parseQvaPayP2PActionResponse,
  parseQvaPayP2PCollection,
  parseQvaPayP2POfferResponse,
  parseQvaPayP2PChatResponse,
} from "../cloudflare/qvapay-contracts.js";

test("accepts a valid paginated QvaPay collection", () => {
  assert.deepEqual(
    parseQvaPayP2PCollection(
      {
        data: [{ uuid: "offer-1", amount: 10, receive: 11 }],
        total: 1,
        per_page: 100,
      },
      0,
      100,
    ),
    {
      data: [{ uuid: "offer-1", amount: 10, receive: 11 }],
      total: 1,
      perPage: 100,
    },
  );
});

test("accepts omitted pagination metadata using explicit fallbacks", () => {
  assert.deepEqual(parseQvaPayP2PCollection({ data: [] }, 4, 25), {
    data: [],
    total: 4,
    perPage: 25,
  });
});

test("rejects malformed collection envelopes and non-numeric pagination", () => {
  assert.equal(parseQvaPayP2PCollection({ data: {} }), null);
  assert.equal(parseQvaPayP2PCollection({ data: [null] }), null);
  assert.equal(parseQvaPayP2PCollection({ data: [], total: "1" }), null);
  assert.equal(parseQvaPayP2PCollection({ data: [], per_page: "100" }), null);
});

test("rejects numeric strings instead of coercing them", () => {
  assert.equal(finiteNumber("10"), null);
  assert.equal(finiteNonNegativeNumber("10"), null);
  assert.equal(finiteNumber(Number.NaN), null);
  assert.equal(finiteNumber(Number.POSITIVE_INFINITY), null);
  assert.equal(finiteNonNegativeNumber(-0.01), null);
});

test("accepts object action responses and rejects ambiguous payloads", () => {
  assert.deepEqual(parseQvaPayP2PActionResponse({ success: true }), {
    payload: { success: true },
  });
  assert.equal(parseQvaPayP2PActionResponse([]), null);
  assert.equal(parseQvaPayP2PActionResponse(null), null);
  assert.equal(parseQvaPayP2PActionResponse("ok"), null);
});

test("names the P2P offer, action and chat contracts explicitly", () => {
  const payload = { success: true };
  assert.deepEqual(parseQvaPayP2POfferResponse(payload), { payload });
  assert.deepEqual(parseQvaPayP2PActionResponse(payload), { payload });
  assert.deepEqual(parseQvaPayP2PChatResponse(payload), { payload });
});

test("validates the sanitized P2P fixture at the integration boundary", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../src/tests/fixtures/qvapay-p2p-response.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const contract = parseQvaPayP2PCollection(fixture);
  assert.equal(contract?.data.length, 1);
  assert.equal(contract?.data[0]?.amount, 100);
  assert.equal(contract?.total, 1);
  assert.equal(contract?.perPage, 100);
});
