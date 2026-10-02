#!/usr/bin/env node
/**
 * @file generate-ai-auditor-token.mjs
 * @path scripts/generate-ai-auditor-token.mjs
 * @description Genera una credencial de AI Auditor y su digest SHA-256 sin persistir secretos.
 * @module scripts
 * @status active
 */

import { createHash, randomBytes } from "node:crypto";

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token, "utf8").digest("hex");

console.log("AI Auditor token (store securely; do not commit it):");
console.log(token);
console.log("");
console.log("AI_AUDITOR_TOKEN_HASH:");
console.log(hash);
console.log("");
console.log("Configure the hash as a Cloudflare Worker secret:");
console.log("npx wrangler secret put AI_AUDITOR_TOKEN_HASH");
