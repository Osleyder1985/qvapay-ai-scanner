#!/usr/bin/env node
/**
 * @file validate-qvapay-real.mjs
 * @path scripts/validate-qvapay-real.mjs
 * @description Captura evidencia real de aceptación de la API de QvaPay sin persistir secretos.
 * @module validation
 * @status active
 *
 * El modo de sólo lectura es el predeterminado. Una aplicación P2P real requiere --apply <uuid> y
 * ALLOW_REAL_MUTATION=YES. The script never prints app-secret.
 */
const baseUrl = (process.env.QVAPAY_API_BASE_URL ?? "https://api.qvapay.com").replace(/\/$/, "");
const appId = process.env.QVAPAY_APP_ID;
const appSecret = process.env.QVAPAY_APP_SECRET;
const args = process.argv.slice(2);
const applyIndex = args.indexOf("--apply");
const applyUuid = applyIndex >= 0 ? args[applyIndex + 1] : null;

if (!appId || !appSecret) { console.error("Missing QVAPAY_APP_ID or QVAPAY_APP_SECRET."); process.exit(2); }
if (applyIndex >= 0 && (!applyUuid || applyUuid.startsWith("--"))) { console.error("--apply requires a P2P offer UUID."); process.exit(2); }
if (applyIndex >= 0 && process.env.ALLOW_REAL_MUTATION !== "YES") { console.error("Refusing real mutation. Set ALLOW_REAL_MUTATION=YES together with --apply <uuid>."); process.exit(3); }

const headers = { Accept: "application/json", "app-id": appId, "app-secret": appSecret, "User-Agent": "qvapay-ai-scanner-real-validation/1.0" };

async function request(path, init = {}) {
  const started = Date.now();
  const response = await fetch(new URL(path, baseUrl), { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, ok: response.ok, elapsedMs: Date.now() - started, headers: { retryAfter: response.headers.get("retry-after"), cache: response.headers.get("x-cache") }, body };
}

function print(name, result) { console.log(JSON.stringify({ name, status: result.status, ok: result.ok, elapsedMs: result.elapsedMs, headers: result.headers, body: result.body }, null, 2)); }

console.log("# QvaPay real validation");
console.log(JSON.stringify({ baseUrl, appIdPresent: Boolean(appId), secretPresent: Boolean(appSecret), mutationRequested: Boolean(applyUuid), timestamp: new Date().toISOString() }, null, 2));

const info = await request("/v2/info", { method: "POST" });
print("app-info", info);
if (!info.ok) process.exit(10);
const market = await request("/p2p?take=10&page=1");
print("p2p-market", market);
if (!market.ok) process.exit(11);

if (applyUuid) {
  const detail = await request("/p2p/" + encodeURIComponent(applyUuid));
  print("offer-before-apply", detail);
  if (!detail.ok) process.exit(12);
  const apply = await request("/p2p/" + encodeURIComponent(applyUuid) + "/apply", { method: "POST" });
  print("apply", apply);
  if (!apply.ok) process.exit(13);
  const after = await request("/p2p/" + encodeURIComponent(applyUuid));
  print("offer-after-apply", after);
  if (!after.ok) process.exit(14);
}

console.log("# Validation sequence completed.");