/**
 * @file ai-audit-auth.ts
 * @path src/cloudflare/ai-audit-auth.ts
 * @description Autenticación de identidad técnica de auditoría exclusivamente de lectura.
 * @module cloudflare
 * @status active
 */

const TOKEN_PREFIX = "Bearer ";
const MAX_TOKEN_LENGTH = 512;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

const buckets = new Map<string, { count: number; resetAt: number }>();

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function extractBearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization")?.trim() ?? "";
  if (!value.startsWith(TOKEN_PREFIX)) return null;
  const token = value.slice(TOKEN_PREFIX.length).trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

function pruneBuckets(now: number): void {
  if (buckets.size < 256) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

async function authorize(
  request: Request,
  expectedTokenHash?: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (request.method !== "GET") {
    return {
      ok: false,
      status: 405,
      error: "AI Auditor sólo permite solicitudes GET.",
    };
  }

  if (!expectedTokenHash) {
    return {
      ok: false,
      status: 503,
      error: "AI Auditor no está configurado.",
    };
  }

  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Autenticación requerida." };
  }

  const suppliedHash = await sha256Hex(token);
  if (
    !constantTimeEqual(suppliedHash, expectedTokenHash.trim().toLowerCase())
  ) {
    return { ok: false, status: 401, error: "Credenciales inválidas." };
  }

  const now = Date.now();
  const key = suppliedHash;
  pruneBuckets(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      ok: false,
      status: 429,
      error: "Límite de solicitudes de auditoría excedido.",
    };
  } else {
    bucket.count += 1;
  }

  return { ok: true };
}

export { authorize as authorizeAiAuditor, sha256Hex as hashAiAuditorToken };
