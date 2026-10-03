import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}

const wranglerSource = read("wrangler.jsonc");
const mainMatch = wranglerSource.match(/["']?main["']?\s*:\s*["']([^"']+)["']/);
if (mainMatch?.[1] !== "src/worker.ts") {
  failures.push(`El único entrypoint Wrangler esperado es src/worker.ts; encontrado: ${mainMatch?.[1] ?? "ausente"}`);
}

const forbiddenPaths = [
  "src/worker/index.ts",
  "src/worker/auto-apply-runtime.ts",
  "src/backend/cloudflare",
];
for (const relative of forbiddenPaths) {
  if (exists(relative)) failures.push(`Frontera Cloudflare paralela detectada: ${relative}`);
}

const worker = read("src/worker.ts");
for (const required of [
  "./cloudflare/cloudflare-router.js",
  "./cloudflare/access.js",
  "./cloudflare/arbitrage-monitor-routes.js",
  "./cloudflare/arbitrage-monitor-do.js",
]) {
  if (!worker.includes(required)) failures.push(`El entrypoint no compone la implementación canónica: ${required}`);
}

const monitorDo = read("src/cloudflare/arbitrage-monitor-do.ts");
if (!monitorDo.includes("export class ArbitrageMonitor")) {
  failures.push("ArbitrageMonitor no está definido en su único adaptador Durable Object.");
}

const monitorBindingMatch = wranglerSource.match(
  /["']?name["']?\s*:\s*["']ARBITRAGE_MONITOR["'][^}]*["']?class_name["']?\s*:\s*["']([^"']+)["']/s,
);
if (monitorBindingMatch?.[1] !== "ArbitrageMonitor") {
  failures.push("El binding ARBITRAGE_MONITOR no apunta a ArbitrageMonitor.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Cloudflare architecture contract passed: single production runtime verified.");
