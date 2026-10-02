/**
 * @file ai-audit-auth.test.ts
 * @path src/tests/ai-audit-auth.test.ts
 * @description Verifica autenticación, autorización read-only y rate limiting del AI Auditor.
 * @module tests
 * @status active
 */

import test from "node:test";
import assert from "node:assert/strict";
import { authorizeAiAuditor, hashAiAuditorToken } from "../cloudflare/ai-audit-auth.js";

const token = "test-ai-auditor-token";

test("AI Auditor accepts the configured bearer token for GET", async () => {
  const hash = await hashAiAuditorToken(token);
  const request = new Request("https://example.test/api/ai-audit/health", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const result = await authorizeAiAuditor(request, hash);
  assert.deepEqual(result, { ok: true });
});

test("AI Auditor rejects missing and invalid credentials", async () => {
  const hash = await hashAiAuditorToken(token);

  const missing = await authorizeAiAuditor(
    new Request("https://example.test/api/ai-audit/health"),
    hash,
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 401);

  const invalid = await authorizeAiAuditor(
    new Request("https://example.test/api/ai-audit/health", {
      headers: { Authorization: "Bearer wrong-token" },
    }),
    hash,
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.status, 401);
});

test("AI Auditor rejects non-GET requests", async () => {
  const hash = await hashAiAuditorToken(token);
  const request = new Request("https://example.test/api/ai-audit/health", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const result = await authorizeAiAuditor(request, hash);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 405);
});

test("AI Auditor fails closed when its secret is not configured", async () => {
  const result = await authorizeAiAuditor(
    new Request("https://example.test/api/ai-audit/health", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    undefined,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 503);
});
