/**
 * @file auto-apply-ui.test.ts
 * @path src/tests/auto-apply-ui.test.ts
 * @description Evita que la UI ofrezca escritura para Auto-Apply mientras el backend la rechaza.
 * @module tests
 * @status test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("does not render unavailable Auto-Apply configuration controls", () => {
  const source = readFileSync("src/frontend/pages.js", "utf8");

  assert.match(source, /Configuración no disponible en Cloudflare/);
  assert.match(source, /No se pueden guardar reglas/);
  assert.doesNotMatch(source, /<button class="button primary wide">Guardar reglas<\/button>/);
});
