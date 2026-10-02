import { readFile } from "node:fs/promises";
import prettier from "prettier";
const file = "src/cloudflare/ai-audit-routes.ts";
const source = await readFile(file, "utf8");
process.stdout.write(await prettier.format(source, { filepath: file }));
