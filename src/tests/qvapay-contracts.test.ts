import assert from "node:assert/strict";
import test from "node:test";
import {
  finiteNonNegativeNumber,
  finiteNumber,
  parseQvaPayActionResponse,
  parseQvaPayCollection,
} from "../cloudflare/qvapay-contracts.js";

test("accepts a valid paginated QvaPay collection", () => {
  assert.deepEqual(
    parseQvaPayCollection(
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
  assert.deepEqual(parseQvaPayCollection({ data: [] }, 4, 25), {
    data: [],
    total: 4,
    perPage: 25,
  });
});

test("rejects malformed collection envelopes and non-numeric pagination", () => {
  assert.equal(parseQvaPayCollection({ data: {} }), null);
  assert.equal(parseQvaPayCollection({ data: [null] }), null);
  assert.equal(parseQvaPayCollection({ data: [], total: "1" }), null);
  assert.equal(parseQvaPayCollection({ data: [], per_page: "100" }), null);
});

test("rejects numeric strings instead of coercing them", () => {
  assert.equal(finiteNumber("10"), null);
  assert.equal(finiteNonNegativeNumber("10"), null);
  assert.equal(finiteNumber(Number.NaN), null);
  assert.equal(finiteNumber(Number.POSITIVE_INFINITY), null);
  assert.equal(finiteNonNegativeNumber(-0.01), null);
});

test("accepts object action responses and rejects ambiguous payloads", () => {
  assert.deepEqual(parseQvaPayActionResponse({ success: true }), {
    payload: { success: true },
  });
  assert.equal(parseQvaPayActionResponse([]), null);
  assert.equal(parseQvaPayActionResponse(null), null);
  assert.equal(parseQvaPayActionResponse("ok"), null);
});
