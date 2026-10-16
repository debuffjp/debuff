// Fails if development-only code leaks into a production build.
// Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = "examples/sandbox/dist";
const FORBIDDEN = ["__DEBUFF_DEV__", "describeParams"];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(DIST).filter((f) => /\.(js|html)$/.test(f));
} catch {
  console.error(`No build output at ${DIST}. Run \`npm run build\` first.`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const leaks = FORBIDDEN.filter((token) => text.includes(token));
  const gz = gzipSync(text).length;
  console.log(`${file}  ${text.length} B  (${gz} B gzip)${leaks.length ? "  LEAK: " + leaks.join(", ") : ""}`);
  if (leaks.length) failed = true;
}

if (failed) {
  console.error("Dev-only code found in production build.");
  process.exit(1);
}
console.log("Boundary check passed.");
