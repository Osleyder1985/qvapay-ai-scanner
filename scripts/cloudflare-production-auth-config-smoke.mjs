const baseUrl = (process.env.SMOKE_BASE_URL ?? "").replace(/\/$/, "");

if (!baseUrl) throw new Error("Define SMOKE_BASE_URL en el entorno.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameOriginHeaders() {
  return { "Content-Type": "application/json", Origin: baseUrl };
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  return fetch(new URL(path, baseUrl), { ...init, headers, redirect: "manual" });
}

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { raw: text }; }
}

const health = await request("/api/health");
assert(health.status === 200, `/api/health devolvió HTTP ${health.status}`);
const healthPayload = await readJson(health);
assert(healthPayload.ok === true, "/api/health no confirmó ok=true");

const unauthenticated = await request("/api/p2p?page=1&take=1");
assert(unauthenticated.status === 401, `/api/p2p sin sesión devolvió HTTP ${unauthenticated.status}`);

const login = await request("/api/auth/login", {
  method: "POST",
  headers: sameOriginHeaders(),
  body: JSON.stringify({
    username: "__production_auth_diagnostic_invalid_user__",
    password: "__production_auth_diagnostic_invalid_password__",
  }),
});
const loginPayload = await readJson(login);

assert(
  login.status === 401,
  `diagnóstico de autenticación devolvió HTTP ${login.status}; payload=${JSON.stringify(loginPayload)}. HTTP 503 indicaría que el Worker no tiene AUTH_USERNAME/AUTH_PASSWORD disponibles o que el rate limiter/D1 falló.`,
);
assert(
  loginPayload.error === "Credenciales inválidas.",
  `diagnóstico de autenticación devolvió un contrato inesperado: ${JSON.stringify(loginPayload)}`,
);

console.log("Cloudflare production auth configuration smoke: PASS");
console.log("Health endpoint: PASS");
console.log("Private API protection: PASS");
console.log("Authentication configuration is reachable without exposing credentials: PASS");
