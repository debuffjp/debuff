// Music timing under main-thread load, in headless Chrome: node bench/music-timing/run.mjs
// Writes results/<date>-<platform>.json with every note's timing error and a summary per round, engine and condition.
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const server = await createServer({ root: here, logLevel: "error", server: { port: 0, fs: { allow: [join(here, "../..")] } } });
await server.listen();
const browser = await chromium.launch({
  channel: process.env.BENCH_BROWSER_CHANNEL ?? "chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error(e));
  await page.goto(server.resolvedUrls.local[0]);
  const handle = await page.waitForFunction(() => window.__results || window.__error, undefined, { timeout: 600_000 });
  const data = await handle.jsonValue();
  if (typeof data === "string") throw new Error(data);
  const report = { date: new Date().toISOString(), browser: browser.version(), cpu: cpus()[0]?.model, platform: process.platform, ...data };
  mkdirSync(join(here, "results"), { recursive: true });
  const file = join(here, "results", `${report.date.slice(0, 10)}-${process.platform}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  report.results.forEach((round, i) => {
    console.log(`round ${i + 1}`);
    for (const [condition, engines] of Object.entries(round)) {
      for (const [engine, s] of Object.entries(engines)) {
        const drops = s.droppedAt.length ? `  dropped at ${s.droppedAt.join(", ")} s` : "";
        console.log(
          `  ${condition.padEnd(6)} ${engine.padEnd(11)} notes ${String(s.notes).padStart(4)}  dropped ${String(s.dropped).padStart(3)}  median ${s.medianMs} ms  p95 ${s.p95Ms} ms  max ${s.maxMs} ms  >10 ms ${(s.over10ms * 100).toFixed(1)}%${drops}`,
        );
      }
    }
  });
  console.log(`\nSaved ${file}`);
} finally {
  await browser.close();
  await server.close();
}
