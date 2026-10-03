import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = join(process.cwd(), "src", "frontend");

test("Auto-Apply UI does not expose unavailable configuration controls", () => {
  const source = readFileSync(join(root, "pages.js"), "utf8");
  assert.match(source, /Configuración no disponible en Cloudflare/);
  assert.match(source, /No se pueden guardar reglas/);
  assert.doesNotMatch(source, /Guardar reglas/);
});
