import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["src", "scripts"];
const extensions = new Set([".ts", ".js", ".mjs"]);
const forbiddenPatterns = [
  /\bImplements the\b/i,
  /\bInput used by the (operation|method)\b/i,
  /\bThe operation result\b/i,
  /\bPublic (interface|type|class) .* used by the module\b/i,
  /\bTests the\b/i,
  /\bTest coverage for\b/i,
  /\bUnit tests for\b/i,
  /\bThe dashboard exposes\b/i,
];

function collectFiles(root) {
  const result = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...collectFiles(path));
    else if (extensions.has(path.slice(path.lastIndexOf(".")))) result.push(path);
  }
  return result;
}

function extractComments(source) {
  const comments = [];
  const block = /\/\*[\\s\\S]*?\*\//g;
  const line = /(^|[^:])\/\/.*$/gm;
  for (const match of source.matchAll(block)) comments.push({ text: match[0], index: match.index ?? 0 });
  for (const match of source.matchAll(line)) comments.push({ text: match[0].slice(match[0].indexOf("//")), index: match.index ?? 0 });
  return comments;
}

const violations = [];
for (const root of roots) {
  for (const path of collectFiles(root)) {
    const source = readFileSync(path, "utf8");
    for (const comment of extractComments(source)) {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(comment.text)) {
          violations.push(relative(process.cwd(), path) + ": " + comment.text.trim().replace(/\s+/g, " "));
          break;
        }
      }
    }
  }
}

if (violations.length) {
  console.error("Se detectaron patrones de documentación humana en inglés:");
  for (const violation of violations) console.error("- " + violation);
  process.exit(1);
}

console.log("Source documentation language check: PASS");
