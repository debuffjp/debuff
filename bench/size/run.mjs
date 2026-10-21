// Download size: builds a one-sprite app with spryte, PixiJS 8 and Phaser 4 (Vite production builds) and
// measures the JavaScript, brotli-compressed, at startup and in total. Writes results/<date>.json.
//   npm run build && node bench/size/run.mjs
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const modules = join(here, "../../node_modules");
const version = (pkg) => JSON.parse(readFileSync(join(modules, pkg, "package.json"), "utf8")).version;
const brotli = (b) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

const results = {};
for (const name of ["spryte", "pixi", "phaser"]) {
  const root = join(here, "apps", name);
  const out = join(root, "dist");
  rmSync(out, { recursive: true, force: true });
  await build({ root, logLevel: "error", build: { outDir: out } });
  const html = readFileSync(join(out, "index.html"), "utf8");
  let startup = 0;
  let total = 0;
  const files = readdirSync(join(out, "assets")).filter((f) => f.endsWith(".js"));
  for (const f of files) {
    const size = brotli(readFileSync(join(out, "assets", f)));
    total += size;
    // Startup = scripts the page loads directly; everything else is a lazy chunk.
    if (html.includes(f)) startup += size;
  }
  results[name] = { startupBrotliBytes: startup, totalBrotliBytes: total, files: files.length };
  rmSync(out, { recursive: true, force: true });
  console.log(
    `${name.padEnd(7)} startup ${(startup / 1024).toFixed(1)} kB · all JS ${(total / 1024).toFixed(1)} kB · ${files.length} files (brotli 11)`,
  );
}
const report = {
  date: new Date().toISOString(),
  method: "Vite production build of apps/<name> (one rotated sprite), JS only, brotli quality 11",
  versions: { spryte: version("spryte"), "pixi.js": version("pixi.js"), phaser: version("phaser"), vite: version("vite") },
  results,
};
const file = join(here, "results", `${report.date.slice(0, 10)}.json`);
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Saved ${file}`);
