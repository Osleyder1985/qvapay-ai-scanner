import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";

const baseUrl = "http://127.0.0.1:8787";
const qvapayMockUrl = "http://127.0.0.1:8788";
const username = "ci-smoke-user";
const password = `ci-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const devVarsPath = ".dev.vars";
let server;
let qvapayMockServer;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSecurityHeaders(response, label) {
  const expected = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };

  for (const [name, value] of Object.entries(expected)) {
    assert(
      response.headers.get(name) === value,
      label + " no devolvió " + name + "=" + value + "; recibido: " + (response.headers.get(name) ?? "<ausente>") + "; headers: " + JSON.stringify(Object.fromEntries(response.headers.entries())),
    );
  }

  const csp = response.headers.get("Content-Security-Policy") ?? "";
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "connect-src 'self'",
  ]) {
    assert(csp.includes(directive), `${label} CSP no contiene: ${directive}`);
  }

  assert(
    !csp.includes("https://api.qvapay.com"),
    `${label} CSP concede conexión directa innecesaria a QvaPay`,
  );
}

async function request(path, init = {}, cookie = "") {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(new URL(path, baseUrl), {
    ...init,
    headers,
    redirect: "manual",
  });
}

async function applyLocalD1Migrations() {
  console.log("Applying D1 migrations to the local smoke database...");
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["wrangler", "d1", "migrations", "apply", "qvapay-ai-scanner", "--local"],
      { stdio: "inherit", env: { ...process.env } },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `wrangler d1 migrations apply failed with code ${code ?? "null"}${signal ? ` (signal ${signal})` : ""}`,
        ),
      );
    });
  });
  console.log("Local D1 migrations: PASS");
}

async function waitForServer() {
  let lastError = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Cloudflare local runtime no inició: ${lastError}`);
}

function cleanup() {
  if (server && !server.killed) server.kill();
  if (qvapayMockServer) qvapayMockServer.close();
  if (existsSync(devVarsPath)) unlinkSync(devVarsPath);
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

qvapayMockServer = createServer((request, response) => {
  if (request.url?.startsWith("/p2p") && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        data: [
          {
            uuid: "ci-smoke-offer",
            type: "sell",
            coin: "USDT",
            amount: 100,
            receive: 100,
            status: "open",
          },
        ],
        total: 1,
        per_page: 1,
      }),
    );
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});
await new Promise((resolve, reject) => {
  qvapayMockServer.once("error", reject);
  qvapayMockServer.listen(8788, "127.0.0.1", resolve);
});

writeFileSync(
  devVarsPath,
  [
    `AUTH_USERNAME=${username}`,
    `AUTH_PASSWORD=${password}`,
    `QVAPAY_API_BASE_URL=${qvapayMockUrl}`,
    "QVAPAY_APP_ID=ci-smoke-app",
    "QVAPAY_APP_SECRET=ci-smoke-secret",
    "",
  ].join("\n"),
  "utf8",
);

const wranglerEnv = {
  ...process.env,
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
};

server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", "8787"],
  { stdio: ["ignore", "pipe", "pipe"], env: wranglerEnv },
);

server.stdout.on("data", (chunk) => process.stdout.write(`[wrangler] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[wrangler] ${chunk}`));

await applyLocalD1Migrations();

await waitForServer();

const health = await request("/api/health");
assert(health.status === 200, `/api/health devolvió HTTP ${health.status}`);
assertSecurityHeaders(health, "/api/health");

const loginPage = await request("/login");
assert(loginPage.status === 200, `/login devolvió HTTP ${loginPage.status}`);
console.log("Login response headers:", Object.fromEntries(loginPage.headers.entries()));
assertSecurityHeaders(loginPage, "/login");

const redirect = await request("/");
assert(redirect.status === 302, `/ sin sesión devolvió HTTP ${redirect.status}`);
assert(
  redirect.headers.get("location")?.endsWith("/login"),
  "/ sin sesión no redirigió a /login",
);
assertSecurityHeaders(redirect, "redirección /");

const unauthenticated = await request("/api/p2p?page=1&take=1");
assert(
  unauthenticated.status === 401,
  `/api/p2p sin sesión devolvió HTTP ${unauthenticated.status}, esperado 401`,
);
assertSecurityHeaders(unauthenticated, "/api/p2p sin sesión");

const login = await request("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseUrl },
  body: JSON.stringify({ username, password }),
});
assert(login.status === 200, `login devolvió HTTP ${login.status}`);
assertSecurityHeaders(login, "login");

const setCookie = login.headers.get("set-cookie") ?? "";
const sessionMatch = setCookie.match(/qvas_session=([^;]+)/);
assert(sessionMatch?.[1], "login no devolvió cookie qvas_session");
const cookie = `qvas_session=${sessionMatch[1]}`;

const session = await request("/api/auth/session", {}, cookie);
assert(session.status === 200, `/api/auth/session devolvió HTTP ${session.status}`);
assertSecurityHeaders(session, "/api/auth/session");
const sessionPayload = await session.json();
assert(sessionPayload.authenticated === true, "La sesión no quedó autenticada");

const dashboard = await request("/", {}, cookie);
assert(
  dashboard.status === 200,
  `dashboard autenticado devolvió HTTP ${dashboard.status}`,
);
assertSecurityHeaders(dashboard, "dashboard");

const market = await request("/api/p2p?page=1&take=1", {}, cookie);
assert(
  market.status === 200,
  `/api/p2p autenticado devolvió HTTP inesperado ${market.status}`,
);
assertSecurityHeaders(market, "/api/p2p autenticado");
const marketPayload = await market.json();
assert(
  Array.isArray(marketPayload.data) &&
    marketPayload.data[0]?.uuid === "ci-smoke-offer",
  "La ruta autenticada /api/p2p no propagó correctamente la respuesta del adaptador QvaPay de prueba",
);

const logout = await request(
  "/api/auth/logout",
  { method: "POST", headers: { Origin: baseUrl } },
  cookie,
);
assert(logout.status === 200, `logout devolvió HTTP ${logout.status}`);
assertSecurityHeaders(logout, "logout");

const afterLogout = await request("/api/auth/session", {}, cookie);
assert(
  afterLogout.status === 401,
  `la sesión siguió válida después de logout: HTTP ${afterLogout.status}`,
);
assertSecurityHeaders(afterLogout, "/api/auth/session después de logout");

console.log("Cloudflare local runtime smoke test: PASS");
console.log("Health + security headers: PASS");
console.log("Login + D1 session: PASS");
console.log("Unauthenticated route protection: PASS");
console.log("Dashboard static asset boundary: PASS");
console.log("Authenticated API boundary: PASS");
console.log("Logout + session invalidation: PASS");

cleanup();
