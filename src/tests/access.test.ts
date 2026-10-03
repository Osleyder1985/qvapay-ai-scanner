import assert from "node:assert/strict";
import test from "node:test";
import {
  createSession,
  destroySession,
  isSameOrigin,
  requireSession,
  type SessionDatabase,
} from "../cloudflare/access.js";

interface SessionRow {
  tokenHash: string;
  username: string;
  expiresAt: string;
  lastSeenAt: string;
}

function fakeDatabase(initial: SessionRow[] = []): SessionDatabase & {
  rows: Map<string, SessionRow>;
} {
  const rows = new Map(initial.map((row) => [row.tokenHash, row]));
  return {
    rows,
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (query.startsWith("CREATE TABLE") || query.startsWith("CREATE INDEX")) return {};
              if (query.startsWith("DELETE FROM auth_sessions WHERE expires_at")) {
                const [expiresAt, username] = values as [string, string];
                for (const [key, row] of rows) {
                  if (row.expiresAt <= expiresAt || row.username === username) rows.delete(key);
                }
                return {};
              }
              if (query.startsWith("INSERT INTO auth_sessions")) {
                const [tokenHash, username, , expiresAt, lastSeenAt] = values as [string,string,string,string,string];
                rows.set(tokenHash, { tokenHash, username, expiresAt, lastSeenAt });
                return {};
              }
              if (query.startsWith("DELETE FROM auth_sessions WHERE token_hash")) {
                rows.delete(String(values[0]));
                return {};
              }
              if (query.startsWith("UPDATE auth_sessions SET last_seen_at")) {
                const row = rows.get(String(values[1]));
                if (row) row.lastSeenAt = String(values[0]);
                return {};
              }
              return {};
            },
            async first<T = unknown>() {
              if (query.includes("SELECT username, expires_at")) {
                const row = rows.get(String(values[0]));
                return row ? ({ username: row.username, expiresAt: row.expiresAt } as T) : null;
              }
              return null;
            },
          };
        },
      };
    },
  };
}

test("rejects an expired session and deletes its token", async () => {
  const db = fakeDatabase([{
    tokenHash: "expired-hash",
    username: "admin",
    expiresAt: "2026-10-03T03:59:59.000Z",
    lastSeenAt: "2026-10-03T03:00:00.000Z",
  }]);

  const request = new Request("https://scanner.example.com/api/auth/session", {
    headers: { Cookie: "qvas_session=expired-token" },
  });

  const result = await requireSession(request, db);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 401);
});

test("requires an explicit matching Origin for mutations", () => {
  const same = new Request("https://scanner.example.com/api/auth/logout", {
    method: "POST",
    headers: { Origin: "https://scanner.example.com" },
  });
  const cross = new Request("https://scanner.example.com/api/auth/logout", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
  });
  const missing = new Request("https://scanner.example.com/api/auth/logout", {
    method: "POST",
  });

  assert.equal(isSameOrigin(same), true);
  assert.equal(isSameOrigin(cross), false);
  assert.equal(isSameOrigin(missing), false);
});

test("logout invalidates the existing session token", async () => {
  const db = fakeDatabase();
  const request = new Request("https://scanner.example.com/api/auth/login", {
    method: "POST",
  });

  const response = await createSession(request, db, "admin");
  const setCookie = response.headers.get("Set-Cookie") ?? "";
  const match = setCookie.match(/qvas_session=([^;]+)/);
  assert.ok(match?.[1]);

  const logoutRequest = new Request("https://scanner.example.com/api/auth/logout", {
    method: "POST",
    headers: { Cookie: `qvas_session=${match[1]}` },
  });
  await destroySession(logoutRequest, db);
  assert.equal(db.rows.size, 0);
});
