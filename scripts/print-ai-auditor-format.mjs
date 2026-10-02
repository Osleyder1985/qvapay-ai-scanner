import { readFile } from "node:fs/promises";
import prettier from "prettier";

const files = [
  "src/cloudflare/ai-audit-auth.ts",
  "src/cloudflare/ai-audit-routes.ts",
  "src/tests/ai-audit-router.test.ts",
];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const formatted = await prettier.format(source, { filepath: file });
  console.log("\n===== " + file + " =====\n");
  console.log(formatted);
}
