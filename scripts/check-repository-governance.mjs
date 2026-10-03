import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const files = walk(root);

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const forbiddenCitationMarkers = ["cite", "url", "entity"].map((prefix) => prefix.replace("", ""));
  if (forbiddenCitationMarkers.some((marker) => text.includes(marker))) {
    failures.push(`Artefacto de citación de asistente: ${path.relative(root, file)}`);
  }
}

for (const file of files.filter((item) => /\.m?js$/.test(item))) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch {
    failures.push(`JavaScript inválido: ${path.relative(root, file)}`);
  }
}

for (const file of files.filter((item) => /\.css$/.test(item))) {
  const text = fs.readFileSync(file, "utf8").replace(/\/\*[^]*?\*\//g, "");
  let balance = 0;
  for (const char of text) {
    if (char === "{") balance += 1;
    if (char === "}") balance -= 1;
    if (balance < 0) break;
  }
  if (balance !== 0) failures.push(`CSS con llaves desbalanceadas: ${path.relative(root, file)}`);
}

const required = [
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/api/openapi.yaml",
  "docs/governance/source-citation-policy.md",
  "docs/governance/references.md",
];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`Archivo de gobernanza ausente: ${relative}`);
}

const openapi = fs.readFileSync(path.join(root, "docs/api/openapi.yaml"), "utf8");
for (const key of ["openapi:", "info:", "paths:"]) {
  if (!new RegExp(`^\\s*${key}`, "m").test(openapi)) failures.push(`OpenAPI sin sección requerida: ${key}`);
}

const markdownFiles = files.filter((file) => /\.md$/.test(file));
const linkPattern = /\\[[^\\]]+\\]\\(([^)]+)\\)/g;
for (const file of markdownFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].split("#")[0].split("?")[0];
    if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      failures.push(`Enlace local roto: ${path.relative(root, file)} -> ${target}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Repository governance checks passed: ${files.length} files inspected.`);
