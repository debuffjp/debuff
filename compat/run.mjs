// Local engine compatibility suite for keiko and myaku: `npm run compat` from the repo root.
// Not run in CI. Each game in games/ is played by keiko (headless, in Node) and recorded by myaku
// (in your installed Chrome or Edge), and the results print as the rows of the READMEs' engine tables.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runTests } from "keiko/runner";
import { createServer } from "vite";
import { record } from "../packages/myaku/dist-cli/record.js";

const games = fileURLToPath(new URL("./games/", import.meta.url));
const only = process.argv.slice(2);
const names = readdirSync(games).filter((g) => only.length === 0 || only.includes(g));

// The spans myaku's README promises for each engine, found without any change to the game.
const spans = {
  phaser4: ["update", "update:level", "render"],
  phaser3: ["update", "update:level", "render"],
  pixi: ["update", "render"],
  excalibur: ["update", "render"],
  kaplay: ["update", "render"],
  three: ["render"],
};

const rows = [];
let failed = false;
for (const name of names) {
  const root = `${games}${name}`;
  const row = { name, keiko: [], myaku: [] };
  const report = await runTests({ root });
  for (const t of report.results) if (t.status === "fail") row.keiko.push(`${t.name}: ${t.error?.message.split("\n")[0]}`);
  for (const o of report.outside) row.keiko.push(`outside a test: ${o.message.split("\n")[0]}`);

  const server = await createServer({ root, logLevel: "silent", server: { port: 0 } });
  await server.listen();
  try {
    const r = await record({
      target: server.resolvedUrls.local[0],
      seconds: 2,
      trace: process.env.MYAKU_TRACE === "1",
      play: async (page) => {
        await page.keyboard.down("ArrowRight");
        await page.mouse.click(200, 100);
      },
    });
    if (r.frames < 30) row.myaku.push(`only ${r.frames} frames in 2 s`);
    for (const w of r.warnings) row.myaku.push(`warning: ${w}`);
    if (!(r.perFrame.draws > 0)) row.myaku.push("no draw calls counted");
    for (const s of spans[name] ?? [])
      if (!(s in r.spans)) row.myaku.push(`no "${s}" span (got ${Object.keys(r.spans).join(", ") || "none"})`);
    row.detail = `${r.frames} frames, p95 ${r.intervalMs.p95} ms, ${r.perFrame.draws} draws/frame, spans: ${Object.keys(r.spans).join(", ") || "none"}`;
    if (r.trace)
      row.detail += ` | trace: shown p95 ${r.trace.presentedMs.p95} ms, ${r.trace.dropped} dropped, hitches ${r.trace.confirmed} confirmed/${r.trace.unconfirmed} unseen/${r.trace.missed.length} missed, gpu ${r.trace.gpuMsPerFrame} ms/frame, cpu p95 ${r.cpuMs.p95} ms, causes ${JSON.stringify(r.causes)}`;
  } catch (e) {
    row.myaku.push(e.message);
  } finally {
    await server.close();
  }
  failed ||= row.keiko.length > 0 || row.myaku.length > 0;
  rows.push(row);
  const mark = (list) => (list.length ? "✘" : "✔");
  console.log(
    `${name.padEnd(10)} keiko ${mark(row.keiko)} (${report.passed}/${report.results.length})  myaku ${mark(row.myaku)}  ${row.detail ?? ""}`,
  );
  for (const p of [...row.keiko.map((m) => `keiko: ${m}`), ...row.myaku.map((m) => `myaku: ${m}`)]) console.log(`           ${p}`);
}
process.exit(failed ? 1 : 0);
