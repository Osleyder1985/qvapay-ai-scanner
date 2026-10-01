const baseUrl = (process.env.SMOKE_BASE_URL ?? "").replace(/\/$/, "");
const username = process.env.AUTH_USERNAME ?? "";
const password = process.env.AUTH_PASSWORD ?? "";

if (!baseUrl || !username || !password) {
  throw new Error(
    "Define SMOKE_BASE_URL, AUTH_USERNAME y AUTH_PASSWORD en el entorno. No los guardes en el repositorio.",
  );
}

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
      `${label} no devolvió ${name}=${value}`,
    );
  }

  const csp = response.headers.get("Content-Security-Policy") ?? "";
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "connect-src 'self',
  ]) {
    assert(
      csp.includes(directive),
      `${label} CSP no contiene: ${directive}`,
    );
  }
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

async function json(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

const health = await request("/api/health");
assert(health.status === 200, `/api/health devolvió HTTP ${health.status}`);
assertSecurityHeaders(health, "/api/health");
const healthPayload = await json(health);
assert(healthPayload.ok === true, "/api/health no confirmó ok=true");

const loginPage = await request("/login");
assert(loginPage.status === 200, `/login devolvió HTTP ${loginPage.status}`);
assertSecurityHeaders(loginPage, "/login");

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
const sessionPayload = await json(session);
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
  `/api/p2p autenticado devolvió HTTP ${market.status}`,
);
assertSecurityHeaders(market, "/api/p2p autenticado");
const marketPayload = await json(market);
assert(
  Array.isArray(marketPayload.data),
  "/api/p2p autenticado no devolvió el contrato data[] esperado",
);

const logout = await request("/api/auth/logout", {
  method: "POST",
  headers: { Origin: baseUrl },
}, cookie);
assert(logout.status === 200, `logout devolvió HTTP ${logout.status}`);
assertSecurityHeaders(logout, "logout");

const afterLogout = await request("/api/auth/session", {}, cookie);
assert(
  afterLogout.status === 401,
  `la sesión siguió válida después de logout: HTTP ${afterLogout.status}`,
);
assertSecurityHeaders(afterLogout, "/api/auth/session después de logout");

console.log("Cloudflare auth + security headers smoke test: PASS");
console.log(`Base URL: ${baseUrl}`);
console.log("Health + headers: PASS");
console.log("Unauthenticated private API + headers: PASS");
console.log("Login + headers + D1 session cookie: PASS");
console.log("Dashboard + headers: PASS");
console.log("Authenticated P2P read + headers: PASS");
console.log("Logout + headers + session invalidation: PASS");
