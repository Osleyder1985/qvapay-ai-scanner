import { strict as assert } from "node:assert";
import test from "node:test";
import {
  createSession,
  credentialsMatch,
  isSameOrigin,
  requireSession,
  requiresSameOrigin,
} from "../cloudflare/access.js";

class FakeDb {
  sessions = new Map<string, { username: string; expiresAt: string }>();

  prepare(query: string) {
    const self = this;
    return {
      bind(...values: unknown[]) {
        return {
          async first<T>() {
            if (!query.startsWith("SELECT")) return null;
            return (self.sessions.get(String(values[0])) ?? null) as T | null;
          },
          async run() {
            if (query.startsWith("INSERT")) {
              self.sessions.set(String(values[0]), {
                username: String(values[1]),
                expiresAt: String(values[3]),
              });
            }
          },
        };
      },
    };
  }
}

test("Authentication credentials are never accepted without configured secrets", () => {
  assert.equal(credentialsMatch({}, "admin", "password"), false);
  assert.equal(
    credentialsMatch(
      { AUTH_USERNAME: "admin", AUTH_PASSWORD: "password" },
      "admin",
      "password",
    ),
    true,
  );
});

test("Session authentication fails closed without a cookie", async () => {
  const result = await requireSession(
    new Request("https://scanner.example/api/p2p"),
    new FakeDb(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 401);
});

test("Mutation requests require a same-origin Origin header", () => {
  const sameOrigin = new Request(
    "https://scanner.example/api/operations/1/paid",
    { method: "POST", headers: { Origin: "https://scanner.example" } },
  );
  const crossOrigin = new Request(
    "https://scanner.example/api/operations/1/paid",
    { method: "POST", headers: { Origin: "https://evil.example" } },
  );
  const missingOrigin = new Request(
    "https://scanner.example/api/operations/1/paid",
    { method: "POST" },
  );

  assert.equal(requiresSameOrigin(sameOrigin), true);
  assert.equal(isSameOrigin(sameOrigin), true);
  assert.equal(isSameOrigin(crossOrigin), false);
  assert.equal(isSameOrigin(missingOrigin), false);
});

test("Safe read requests do not require same-origin enforcement", () => {
  const request = new Request("https://scanner.example/api/p2p", { method: "GET" });
  assert.equal(requiresSameOrigin(request), false);
});

test("Session cookie is HttpOnly and SameSite=Strict", async () => {
  const db = new FakeDb();
  const response = await createSession(
    new Request("https://scanner.example/api/auth/login", { method: "POST" }),
    db,
    "admin",
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
});
