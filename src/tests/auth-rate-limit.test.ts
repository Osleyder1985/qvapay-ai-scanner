import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_RATE_LIMIT_MAX_FAILURES,
  AUTH_RATE_LIMIT_WINDOW_MS,
  clearLoginRateLimit,
  recordFailedLogin,
} from "../cloudflare/auth-rate-limit.js";
import type { SessionDatabase } from "../cloudflare/access.js";

interface Row {
  windowStartedAt: string;
  failedAttempts: number;
  blockedUntil: string | null;
  updatedAt: string;
}

function fakeDatabase(): SessionDatabase & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  return {
    rows,
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (query.includes("INSERT INTO auth_login_rate_limits")) {
                const [
                  key,
                  nowIso,
                  _updatedAt,
                  resetBefore,
                  maxFailures,
                  _resetBefore2,
                  _resetBefore3,
                  _maxFailures2,
                  _maxFailures3,
                  blockedUntil,
                ] = values as [
                  string,
                  string,
                  string,
                  string,
                  number,
                  string,
                  string,
                  number,
                  number,
                  string,
                ];
                const existing = rows.get(key);
                if (!existing || existing.windowStartedAt <= resetBefore) {
                  rows.set(key, {
                    windowStartedAt: nowIso,
                    failedAttempts: 1,
                    blockedUntil: null,
                    updatedAt: nowIso,
                  });
                  return {};
                }

                const failedAttempts = Math.min(
                  existing.failedAttempts + 1,
                  maxFailures,
                );
                rows.set(key, {
                  ...existing,
                  failedAttempts,
                  blockedUntil:
                    failedAttempts >= maxFailures
                      ? blockedUntil
                      : existing.blockedUntil,
                  updatedAt: nowIso,
                });
                return {};
              }

              if (query.includes("DELETE FROM auth_login_rate_limits")) {
                if (query.includes("key_hash = ?")) {
                  rows.delete(String(values[0]));
                } else {
                  const [cutoff, nowIso] = values as [string, string];
                  for (const [key, row] of rows) {
                    if (
                      row.updatedAt <= cutoff &&
                      (!row.blockedUntil || row.blockedUntil <= nowIso)
                    ) {
                      rows.delete(key);
                    }
                  }
                }
                return {};
              }

              return {};
            },
            async first<T = unknown>() {
              if (query.includes("SELECT blocked_until")) {
                const row = rows.get(String(values[0]));
                return (row
                  ? { blockedUntil: row.blockedUntil }
                  : null) as T | null;
              }
              return null;
            },
          };
        },
      };
    },
  };
}

function request(ip: string): Request {
  return new Request("https://scanner.example.com/api/auth/login", {
    method: "POST",
    headers: {
      Origin: "https://scanner.example.com",
      "CF-Connecting-IP": ip,
    },
  });
}

test(\n  "allows four failures and blocks the fifth within the window",\n  async () => {
  const db = fakeDatabase();
  const base = new Date("2026-10-03T04:00:00.000Z");

  for (let i = 1; i < AUTH_RATE_LIMIT_MAX_FAILURES; i += 1) {
    const decision = await recordFailedLogin(
      db,
      request("198.51.100.10"),
      "admin",
      "secret",
      new Date(base.getTime() + i * 1000),
    );
    assert.equal(decision.allowed, true);
    assert.equal(decision.retryAfterSeconds, 0);
  }

  const blocked = await recordFailedLogin(
    db,
    request("198.51.100.10"),
    "admin",
    "secret",
    new Date(base.getTime() + 5000),
  );

  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("separates rate-limit buckets by client address", async () => {
  const db = fakeDatabase();
  const now = new Date("2026-10-03T04:00:00.000Z");

  for (let i = 0; i < AUTH_RATE_LIMIT_MAX_FAILURES; i += 1) {
    await recordFailedLogin(
      db,
      request("198.51.100.10"),
      "admin",
      "secret",
      new Date(now.getTime() + i * 1000),
    );
  }

  const otherClient = await recordFailedLogin(
    db,
    request("198.51.100.11"),
    "admin",
    "secret",
    now,
  );

  assert.equal(otherClient.allowed, true);
  assert.equal(db.rows.size, 2);
});

test("resets the bucket after the fifteen-minute window", async () => {
  const db = fakeDatabase();
  const base = new Date("2026-10-03T04:00:00.000Z");

  for (let i = 0; i < AUTH_RATE_LIMIT_MAX_FAILURES; i += 1) {
    await recordFailedLogin(
      db,
      request("198.51.100.12"),
      "admin",
      "secret",
      new Date(base.getTime() + i * 1000),
    );
  }

  const afterWindow = await recordFailedLogin(
    db,
    request("198.51.100.12"),
    "admin",
    "secret",
    new Date(base.getTime() + AUTH_RATE_LIMIT_WINDOW_MS + 1000),
  );

  assert.equal(afterWindow.allowed, true);
});

test(
  "clears the failed-attempt bucket after successful authentication",
  async () => {
    const db = fakeDatabase();
    const now = new Date("2026-10-03T04:00:00.000Z");

    await recordFailedLogin(
      db,
      request("198.51.100.13"),
      "admin",
      "secret",
      now,
    );
    assert.equal(db.rows.size, 1);

    await clearLoginRateLimit(
      db,
      request("198.51.100.13"),
      "admin",
      "secret",
    );

    assert.equal(db.rows.size, 0);
  },
);
