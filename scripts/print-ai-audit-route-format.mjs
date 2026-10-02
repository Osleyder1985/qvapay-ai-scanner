import { readFile } from "node:fs/promises";
import prettier from "prettier";

const file = "src/cloudflare/ai-audit-routes.ts";
const source = await readFile(file, "utf8");
const formatted = await prettier.format(source, { filepath: file });
if (source === formatted) {
  console.log("FORMAT_EXACT_MATCH");
} else {
  const sourceLines = source.split("\n");
  const formattedLines = formatted.split("\n");
  const limit = Math.max(sourceLines.length, formattedLines.length);
  for (let index = 0; index < limit; index += 1) {
    if (sourceLines[index] !== formattedLines[index]) {
      console.log("FIRST_DIFFERENCE_LINE", index + 1);
      console.log("SOURCE:", JSON.stringify(sourceLines[index]));
      console.log("FORMATTED:", JSON.stringify(formattedLines[index]));
      break;
    }
  }
}
