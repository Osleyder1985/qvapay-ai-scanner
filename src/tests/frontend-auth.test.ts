import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = join(process.cwd(), "src", "frontend");

test("frontend API requests keep same-origin session credentials", () => {
  const source = readFileSync(join(root, "app-core.js"), "utf8");
  assert.match(source, /credentials:'same-origin'/);
});

test("frontend redirects unauthenticated API responses to login", () => {
  const source = readFileSync(join(root, "app-core.js"), "utf8");
  assert.match(source, /r\.status===401/);
  assert.match(source, /location\.replace\('\/login'\)/);
  assert.match(source, /Autenticación requerida/);
});

test("frontend validates the dashboard session before rendering and loading data", () => {
  const source = readFileSync(join(root, "runtime-ui.js"), "utf8");
  assert.match(source, /async function ensureAuthenticated\(\)/);
  assert.match(source, /api\('\/api\/auth\/session'\)/);
  assert.match(source, /if\(\!\(await ensureAuthenticated\(\)\)\)return/);
});
