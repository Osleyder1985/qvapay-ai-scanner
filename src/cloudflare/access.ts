/**
 * @file access.ts
 * @path src/cloudflare/access.ts
 * @description Cookie-session authentication and same-origin protections.
 * @module cloudflare
 * @status active
 */

export interface AuthSession {
  token: string;
  username: string;
  expiresAt: string;
}

export interface AuthEnvironment {
  AUTH_USERNAME?: string;
  AUTH_PASSWORD?: string;
}

export interface SessionDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
}

export type AuthCheck =
  | { ok: true; session: AuthSession }
  | { ok: false; response: Response };

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const COOKIE_NAME = "qvas_session";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cookieSecureAttribute(request: Request): string {
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;

  for (const item of header.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return parts.join("=") || null;
  }

  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function createSession(
  request: Request,
  db: SessionDatabase,
  username: string,
): Promise<Response> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();

  await db
    .prepare(
      "DELETE FROM auth_sessions WHERE expires_at <= ? OR username = ?",
    )
    .bind(now.toISOString(), username)
    .run();

  await db
    .prepare(
      "INSERT INTO auth_sessions (token_hash, username, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      tokenHash,
      username,
      now.toISOString(),
      expiresAt,
      now.toISOString(),
    )
    .run();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie":
        `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${cookieSecureAttribute(request)}`,
    },
  });
}

export async function destroySession(
  request: Request,
  db: SessionDatabase,
): Promise<Response> {
  const token = parseCookie(request, COOKIE_NAME);
  if (token) {
    await db
      .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(await sha256Hex(token))
      .run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cookieSecureAttribute(request)}`,
    },
  });
}

export async function requireSession(
  request: Request,
  db: SessionDatabase,
): Promise<AuthCheck> {
  const token = parseCookie(request, COOKIE_NAME);
  if (!token) {
    return {
      ok: false,
      response: jsonError("Autenticación requerida.", 401),
    };
  }

  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      "SELECT username, expires_at AS expiresAt FROM auth_sessions WHERE token_hash = ?",
    )
    .bind(tokenHash)
    .first<{ username: string; expiresAt: string }>();

  if (!row || Date.parse(row.expiresAt) <= Date.now()) {
    await db
      .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .run();

    return {
      ok: false,
      response: jsonError("Sesión inválida o expirada.", 401),
    };
  }

  await db
    .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?")
    .bind(new Date().toISOString(), tokenHash)
    .run();

  return {
    ok: true,
    session: {
      token,
      username: row.username,
      expiresAt: row.expiresAt,
    },
  };
}

export function credentialsMatch(
  env: AuthEnvironment,
  username: string,
  password: string,
): boolean {
  return Boolean(
    env.AUTH_USERNAME &&
      env.AUTH_PASSWORD &&
      username === env.AUTH_USERNAME &&
      password === env.AUTH_PASSWORD,
  );
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function requiresSameOrigin(request: Request): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
}
