// Renderer benchmark: production-builds the bunnymark page, then for each renderer finds the
// largest sprite count that holds 60 fps and records per-frame main-thread work.
//   npm run bench:renderer            (all renderers)
//   npm run bench:renderer -- canvas2d debuff-webgl
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build, preview } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const ALL = ["canvas2d", "debuff-2d", "debuff-webgl", "pixi-sprite", "pixi-particle"];
const renderers = process.argv.slice(2).filter((a) => ALL.includes(a));
const COUNTS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 400_000, 800_000];
const FRAME_BUDGET_MS = 1000 / 60; // full CPU+GPU frame must fit a 60 Hz frame
const FIXED = [10_000, 50_000];

await build({ root, logLevel: "error" });
const server = await preview({ root, preview: { port: 0 }, logLevel: "error" });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: process.env.DEBUFF_BROWSER_CHANNEL ?? "chrome" });

const results = [];
let gpu = "unknown";
try {
  for (const renderer of renderers.length ? renderers : ALL) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await page.goto(`${base}?renderer=${renderer}`);
    await page.waitForFunction(() => window.__bench?.ready === true, undefined, { timeout: 30_000 });
    gpu = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
    });
    const measure = (count) => page.evaluate((n) => window.__bench.measure(n), count);

    // Fixed counts first: some renderers keep display objects alive once created.
    const fixed = {};
    for (const count of FIXED) fixed[count] = await measure(count);
    let max = 0;
    const ladder = [];
    for (const count of COUNTS) {
      const r = await measure(count);
      ladder.push(r);
      console.log(`  ${renderer} ${count}: ${r.frameMs.toFixed(2)} ms/frame`);
      if (r.frameMs > FRAME_BUDGET_MS) break;
      max = count;
    }
    results.push({ renderer, maxAt60fps: max, fixed, ladder });
    console.log(
      `${renderer.padEnd(14)} max@60fps ≥ ${String(max).padStart(7)}   frame@10k ${fixed[10_000].frameMs.toFixed(2)} ms   frame@50k ${fixed[50_000].frameMs.toFixed(2)} ms`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

const report = { date: new Date().toISOString(), gpu, platform: `${process.platform} ${process.arch}`, budgetMs: FRAME_BUDGET_MS, results };
const outDir = join(root, "results");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${report.date.slice(0, 10)}-${process.platform}.json`);
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nGPU: ${gpu}\nSaved ${file}`);
