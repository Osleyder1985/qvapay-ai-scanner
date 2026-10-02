/**
 * @file security-headers.test.ts
 * @path src/tests/security-headers.test.ts
 * @description Verifica la política HTTP de cabeceras de seguridad.
 * @module tests
 * @status active
 */

import test from "node:test";
import assert from "node:assert/strict";
import { securityHeaders } from "../backend/security-headers.js";

test("security headers define the baseline browser protections", () => {
  const headers = securityHeaders();

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(
    headers["Permissions-Policy"],
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  assert.equal(
    headers["Strict-Transport-Security"],
    "max-age=31536000; includeSubDomains",
  );
});

test("content security policy blocks object embedding and cross-origin framing", () => {
  const policy = securityHeaders()["Content-Security-Policy"] ?? "";

  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /connect-src 'self'(?:;|$)/);
  assert.doesNotMatch(policy, /api\\.qvapay\\.com/);
});
