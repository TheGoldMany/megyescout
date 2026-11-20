// Fails when `next build` produced Edge Runtime output (middleware or `runtime = "edge"` routes).
// Vercel services cannot deploy Edge functions: "Edge Runtime is not supported in services".
import { readFileSync } from "node:fs";

const manifestPath = new URL("../.next/server/middleware-manifest.json", import.meta.url);
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.error("check-no-edge: .next/server/middleware-manifest.json not found — run `npm run build` first");
  process.exit(1);
}
const edge = [...Object.keys(manifest.middleware ?? {}), ...Object.keys(manifest.functions ?? {})];
if (edge.length) {
  console.error(`check-no-edge: Edge Runtime output found (${edge.join(", ")}).`);
  console.error("Vercel services only run Node.js functions: remove middleware.ts / `runtime = \"edge\"`.");
  process.exit(1);
}
console.log("check-no-edge: OK (no Edge Runtime output)");
