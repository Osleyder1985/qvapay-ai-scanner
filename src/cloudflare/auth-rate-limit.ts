/**
 * @file auth-rate-limit.ts
 * @path src/cloudflare/auth-rate-limit.ts
 * @description Rate limiting durable para intentos fallidos de autenticación.
 * @module cloudflare
 * @status active
 */

import type { SessionDatabase } from "./access.js";

export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_RATE_LIMIT_MAX_FAILURES = 5;

interface RateLimitRow {
  blockedUntil: string | null;
}

export interface AuthRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const AUTH_RATE_LIMIT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS auth_login_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_login_rate_limits_blocked_until
  ON auth_login_rate_limits(blocked_until)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_login_rate_limits_updated_at
  ON auth_login_rate_limits(updated_at)`,
];

async function ensureAuthRateLimitSchema(db: SessionDatabase): Promise<void> {
  for (const statement of AUTH_RATE_LIMIT_SCHEMA) {
    await db.prepare(statement).bind().run();
  }
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function clientAddress(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP")?.trim() ||
    request.headers.get("X-Forwarded-For")?.split(",", 1)[0]?.trim() ||
    "unknown"
  );
}

async function rateLimitKey(
  request: Request,
  username: string,
  secret: string,
): Promise<string> {
  return hmacHex(
    secret,
    clientAddress(request) + "\0" + username.trim().toLowerCase(),
  );
}

function retryAfterSeconds(blockedUntil: string | null, nowMs: number): number {
  if (!blockedUntil) return 0;
  return Math.max(1, Math.ceil((Date.parse(blockedUntil) - nowMs) / 1000));
}

export async function recordFailedLogin(
  db: SessionDatabase,
  request: Request,
  username: string,
  secret: string,
  now = new Date(),
): Promise<AuthRateLimitDecision> {
  await ensureAuthRateLimitSchema(db);
  const nowIso = now.toISOString();
  const resetBefore = new Date(
    now.getTime() - AUTH_RATE_LIMIT_WINDOW_MS,
  ).toISOString();
  const blockedUntil = new Date(
    now.getTime() + AUTH_RATE_LIMIT_WINDOW_MS,
  ).toISOString();
  const key = await rateLimitKey(request, username, secret);

  await db
    .prepare(
      `INSERT INTO auth_login_rate_limits
        (key_hash, window_started_at, failed_attempts, blocked_until, updated_at)
       VALUES (?, ?, 1, NULL, ?)
       ON CONFLICT(key_hash) DO UPDATE SET
         failed_attempts = CASE
           WHEN window_started_at <= ? THEN 1
           ELSE MIN(failed_attempts + 1, ?)
         END,
         window_started_at = CASE
           WHEN window_started_at <= ? THEN excluded.window_started_at
           ELSE window_started_at
         END,
         blocked_until = CASE
           WHEN window_started_at <= ? THEN NULL
           WHEN MIN(failed_attempts + 1, ?) >= ? THEN ?
           ELSE blocked_until
         END,
         updated_at = excluded.updated_at`,
    )
    .bind(
      key,
      nowIso,
      nowIso,
      resetBefore,
      AUTH_RATE_LIMIT_MAX_FAILURES,
      resetBefore,
      resetBefore,
      AUTH_RATE_LIMIT_MAX_FAILURES,
      AUTH_RATE_LIMIT_MAX_FAILURES,
      blockedUntil,
    )
    .run();

  const row = await db
    .prepare(
      "SELECT blocked_until AS blockedUntil FROM auth_login_rate_limits WHERE key_hash = ?",
    )
    .bind(key)
    .first<RateLimitRow>();

  const retry = retryAfterSeconds(row?.blockedUntil ?? null, now.getTime());
  return { allowed: retry === 0, retryAfterSeconds: retry };
}

export async function clearLoginRateLimit(
  db: SessionDatabase,
  request: Request,
  username: string,
  secret: string,
): Promise<void> {
  await ensureAuthRateLimitSchema(db);
  const key = await rateLimitKey(request, username, secret);
  await db
    .prepare("DELETE FROM auth_login_rate_limits WHERE key_hash = ?")
    .bind(key)
    .run();
}

export async function pruneLoginRateLimits(
  db: SessionDatabase,
  now = new Date(),
): Promise<void> {
  await ensureAuthRateLimitSchema(db);
  const cutoff = new Date(
    now.getTime() - AUTH_RATE_LIMIT_WINDOW_MS,
  ).toISOString();

  await db
    .prepare(
      "DELETE FROM auth_login_rate_limits WHERE updated_at <= ? AND (blocked_until IS NULL OR blocked_until <= ?)",
    )
    .bind(cutoff, now.toISOString())
    .run();
}
