// Bundle templates marked "bundled" in their template.json into this package before publishing.
// Unbundled official templates download on demand (see src/official.ts), so they never grow the package.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

const source = "../../templates";
const skip = new Set(["node_modules", "dist", ".debuff"]);
rmSync("templates", { recursive: true, force: true });
for (const id of readdirSync(source)) {
  const meta = join(source, id, "template.json");
  const bundled = existsSync(meta) && JSON.parse(readFileSync(meta, "utf8")).bundled === true;
  if (!bundled) continue;
  cpSync(join(source, id), join("templates", id), { recursive: true, filter: (p) => !skip.has(basename(p)) });
  console.log(`bundled template: ${id}`);
}
