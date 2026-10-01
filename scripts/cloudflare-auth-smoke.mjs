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
const healthPayload = await json(health);
assert(healthPayload.ok === true, "/api/health no confirmó ok=true");

const unauthenticated = await request("/api/p2p?page=1&take=1");
assert(
  unauthenticated.status === 401,
  `/api/p2p sin sesión devolvió HTTP ${unauthenticated.status}, esperado 401`,
);

const login = await request("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: baseUrl },
  body: JSON.stringify({ username, password }),
});
assert(login.status === 200, `login devolvió HTTP ${login.status}`);

const setCookie = login.headers.get("set-cookie") ?? "";
const sessionMatch = setCookie.match(/qvas_session=([^;]+)/);
assert(sessionMatch?.[1], "login no devolvió cookie qvas_session");
const cookie = `qvas_session=${sessionMatch[1]}`;

const session = await request("/api/auth/session", {}, cookie);
assert(session.status === 200, `/api/auth/session devolvió HTTP ${session.status}`);
const sessionPayload = await json(session);
assert(sessionPayload.authenticated === true, "La sesión no quedó autenticada");

const market = await request("/api/p2p?page=1&take=1", {}, cookie);
assert(
  market.status === 200,
  `/api/p2p autenticado devolvió HTTP ${market.status}`,
);
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

const afterLogout = await request("/api/auth/session", {}, cookie);
assert(
  afterLogout.status === 401,
  `la sesión siguió válida después de logout: HTTP ${afterLogout.status}`,
);

console.log("Cloudflare auth smoke test: PASS");
console.log(`Base URL: ${baseUrl}`);
console.log("Health: PASS");
console.log("Unauthenticated private API: PASS");
console.log("Login + D1 session cookie: PASS");
console.log("Authenticated P2P read: PASS");
console.log("Logout + session invalidation: PASS");
