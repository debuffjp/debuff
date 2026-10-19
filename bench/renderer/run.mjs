// Renderer benchmark: production-builds the bench page, then for each renderer finds the largest
// sprite count that holds 60 fps, over several interleaved rounds, after checking that every renderer
// draws the same pixels.
//   npm run bench:renderer                                   (bunny scene, every renderer, 3 rounds)
//   npm run bench:renderer -- mixed                          (or particles)
//   npm run bench:renderer -- particles spryte-bulk pixi-particle rounds=5
//   BENCH_NOTE="plugged in, balanced power" npm run bench:renderer
// Positional arguments, since npm swallows unknown --flags.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, release, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build, preview } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const ALL = ["canvas2d", "spryte", "spryte-bulk", "debuff-2d", "debuff-webgl", "pixi-sprite", "pixi-particle"];
const scene = ["mixed", "particles"].find((s) => process.argv.includes(s)) ?? "bunny";
// Which renderers can draw each scene, and which one the others are compared against for parity.
const SCENES = {
  bunny: { renderers: ALL, reference: "spryte" },
  // Rotation, scale, tint and alpha per sprite: Canvas 2D and the position-only bulk paths can't.
  mixed: { renderers: ["spryte", "debuff-webgl", "pixi-sprite"], reference: "spryte" },
  particles: { renderers: ["spryte-bulk", "pixi-particle"], reference: "spryte-bulk" },
};
const chosen = process.argv.slice(2).filter((a) => ALL.includes(a));
const renderers = (chosen.length ? chosen : ALL).filter((r) => SCENES[scene].renderers.includes(r));
const rounds = Number(process.argv.find((a) => a.startsWith("rounds="))?.slice(7) ?? 3);
const COUNTS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 400_000, 800_000, 1_600_000];
const FRAME_BUDGET_MS = 1000 / 60; // the full CPU+GPU frame must fit a 60 Hz frame
// Parity at a sparse count (coverage is meaningful) and a dense one (nobody skips work at scale).
const PARITY_COUNTS = [2_000, 50_000];
// The run fails if a renderer's drawn area drifts this far from the reference, or differs inside sprites.
const COVERAGE_RANGE = [99.5, 100.5];
const MAX_INTERIOR_PERCENT = 0.5;
// Every renderer is measured at these counts in every round, even past the 60 fps budget, so published cells
// never come from a different number of rounds.
const PUBLISHED = [10_000, 50_000, 200_000];
// Channel difference that counts as a different pixel: tint maths may round 1–2 levels differently.
const PARITY_TOLERANCE = 8;

const version = (pkg) => JSON.parse(readFileSync(join(root, "../../node_modules", pkg, "package.json"), "utf8")).version;
const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

/** Power source and plan, read from the OS where we know how (Windows), since laptops throttle on battery. */
function power() {
  if (process.platform !== "win32") return "not detected on this OS; say it in BENCH_NOTE";
  try {
    const run = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const status = run('powershell -NoProfile -Command "(Get-CimInstance Win32_Battery).BatteryStatus"');
    const source = status === "" ? "no battery (desktop)" : status === "2" ? "AC power" : `battery (status ${status})`;
    const plan = run("powercfg /getactivescheme").match(/\(([^)]+)\)/)?.[1] ?? "unknown plan";
    return `${source}, power plan ${plan}`;
  } catch {
    return "unknown";
  }
}

await build({ root, logLevel: "error" });
const server = await preview({ root, preview: { port: 0 }, logLevel: "error" });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: process.env.DEBUFF_BROWSER_CHANNEL ?? "chrome" });

/**
 * Compare a renderer's frame with the reference's. Coverage: drawn area relative to the reference (skipped or
 * culled sprites show here). Interior: differing pixels whose 3×3 neighbourhood is flat (one colour) in both
 * frames. Any edge, even a sprite over another sprite, breaks flatness, so rounding rules that move edges
 * don't count; a wrong tint, alpha or texture inside a sprite does.
 */
function compare(ref, px) {
  const W = 960;
  const H = 540;
  const flat = (b, x, y) => {
    const c = (y * W + x) * 4;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const j = ((y + dy) * W + x + dx) * 4;
        if (Math.max(Math.abs(b[j] - b[c]), Math.abs(b[j + 1] - b[c + 1]), Math.abs(b[j + 2] - b[c + 2])) > PARITY_TOLERANCE) return false;
      }
    return true;
  };
  let differ = 0;
  let drawn = 0;
  let own = 0;
  let refOwn = 0;
  let interior = 0;
  for (let i = 0; i < ref.length; i += 4) {
    // Background is #11140d; count pixels either renderer drew on.
    const bgA = ref[i] === 0x11 && ref[i + 1] === 0x14 && ref[i + 2] === 0x0d;
    const bgB = px[i] === 0x11 && px[i + 1] === 0x14 && px[i + 2] === 0x0d;
    if (!bgB) own++;
    if (!bgA) refOwn++;
    if (bgA && bgB) continue;
    drawn++;
    if (Math.max(Math.abs(ref[i] - px[i]), Math.abs(ref[i + 1] - px[i + 1]), Math.abs(ref[i + 2] - px[i + 2])) > PARITY_TOLERANCE) {
      differ++;
      const x = (i / 4) % W;
      const y = (i / 4 / W) | 0;
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && flat(ref, x, y) && flat(px, x, y)) interior++;
    }
  }
  const pct = (n, d) => (d ? +((100 * n) / d).toFixed(2) : 0);
  return {
    drawnPixels: drawn,
    differingPixels: differ,
    differingPercent: pct(differ, drawn),
    coveragePercent: refOwn ? +((100 * own) / refOwn).toFixed(1) : 0,
    interiorDifferingPercent: pct(interior, drawn),
  };
}

async function dump(renderer, px, ref) {
  const dir = join(root, "results", "parity");
  mkdirSync(dir, { recursive: true });
  const diff = Buffer.from(px);
  for (let i = 0; i < px.length; i += 4) {
    const d = Math.max(Math.abs(ref[i] - px[i]), Math.abs(ref[i + 1] - px[i + 1]), Math.abs(ref[i + 2] - px[i + 2]));
    diff.set(d > PARITY_TOLERANCE ? [255, 0, 0, 255] : [px[i] >> 2, px[i + 1] >> 2, px[i + 2] >> 2, 255], i);
  }
  const page = await browser.newPage();
  for (const [name, data] of [
    [renderer, px],
    [`${renderer}-diff`, diff],
  ]) {
    const url = await page.evaluate(
      ({ b64, w, h }) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const bytes = Uint8ClampedArray.from(atob(b64), (ch) => ch.charCodeAt(0));
        c.getContext("2d").putImageData(new ImageData(bytes, w, h), 0, 0);
        return c.toDataURL("image/png");
      },
      { b64: data.toString("base64"), w: 960, h: 540 },
    );
    writeFileSync(join(dir, `${scene}-${name}.png`), Buffer.from(url.split(",")[1], "base64"));
  }
  await page.close();
}

const open = async (renderer) => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`${base}?renderer=${renderer}&scene=${scene}`);
  await page.waitForFunction(() => window.__bench?.ready === true, undefined, { timeout: 30_000 });
  return page;
};

let gpu = "unknown";
const parity = {};
const samples = Object.fromEntries(renderers.map((r) => [r, {}]));
try {
  // 1. Parity: every renderer draws the same seeded frames; compare each to the reference.
  const snaps = {};
  for (const renderer of renderers) {
    snaps[renderer] = {};
    for (const count of PARITY_COUNTS) {
      // A fresh page per snapshot: the scene is seeded from the start.
      const page = await open(renderer);
      if (gpu === "unknown")
        gpu = await page.evaluate(() => {
          const gl = document.createElement("canvas").getContext("webgl2");
          const ext = gl?.getExtension("WEBGL_debug_renderer_info");
          return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
        });
      const snap = await page.evaluate((n) => window.__bench.snapshot(n), count);
      snaps[renderer][count] = Buffer.from(snap.rgba, "base64");
      await page.close();
    }
  }
  const reference = SCENES[scene].reference in snaps ? SCENES[scene].reference : renderers[0];
  const failures = [];
  for (const renderer of renderers) {
    parity[renderer] = {};
    for (const count of PARITY_COUNTS) {
      const ref = snaps[reference][count];
      const px = snaps[renderer][count];
      const p = compare(ref, px);
      parity[renderer][count] = p;
      // PARITY_DUMP=1 writes the frames as PNGs (and a diff in red) to results/parity/ for a look.
      if (process.env.PARITY_DUMP) await dump(`${renderer}-${count}`, px, ref);
      const ok =
        p.coveragePercent >= COVERAGE_RANGE[0] &&
        p.coveragePercent <= COVERAGE_RANGE[1] &&
        p.interiorDifferingPercent <= MAX_INTERIOR_PERCENT;
      if (!ok) failures.push(`${renderer} at ${count}`);
      console.log(
        `parity ${ok ? "ok  " : "FAIL"} ${renderer.padEnd(14)} ${String(count).padStart(6)}: coverage ${p.coveragePercent}%, ${p.differingPercent}% of drawn pixels differ (${p.interiorDifferingPercent}% inside sprites)`,
      );
    }
  }
  if (failures.length)
    throw new Error(`Parity failed (${failures.join(", ")}): renderers don't draw the same scene, so timings aren't comparable.`);

  // 2. Timing: rounds interleave renderers in a rotating order, so heat and ordering spread evenly.
  const lastPublished = Math.max(...PUBLISHED);
  for (let round = 0; round < rounds; round++) {
    const order = renderers.map((_, i) => renderers[(i + round) % renderers.length]);
    for (const renderer of order) {
      const page = await open(renderer);
      let over = false;
      for (const count of COUNTS) {
        // Past the 60 fps budget, only the published counts are still measured, so every round has them.
        if (over && (count > lastPublished || !PUBLISHED.includes(count))) {
          if (count > lastPublished) break;
          continue;
        }
        const r = await page.evaluate((n) => window.__bench.measure(n), count);
        samples[renderer][count] ??= [];
        samples[renderer][count].push(r);
        if (r.frameMs > FRAME_BUDGET_MS) over = true;
      }
      await page.close();
      console.log(`  round ${round + 1}/${rounds} ${renderer} done`);
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const results = renderers.map((renderer) => {
  const byCount = Object.entries(samples[renderer])
    .map(([count, runs]) => {
      const frame = runs.map((r) => r.frameMs);
      return {
        count: Number(count),
        runs: runs.length,
        frameMs: median(frame),
        minFrameMs: Math.min(...frame),
        maxFrameMs: Math.max(...frame),
        p95FrameMs: median(runs.map((r) => r.p95FrameMs)),
        submitMs: median(runs.map((r) => r.submitMs)),
      };
    })
    .sort((a, b) => a.count - b.count);
  // Largest count whose median frame fits the budget, measured in every round.
  let maxAt60fps = 0;
  for (const c of byCount) if (c.runs === rounds && c.frameMs <= FRAME_BUDGET_MS) maxAt60fps = c.count;
  return { renderer, maxAt60fps, parity: parity[renderer], counts: byCount };
});

const report = {
  date: new Date().toISOString(),
  scene,
  rounds,
  environment: {
    gpu,
    browser: `Chrome ${browser.version()}`,
    os: `${process.platform} ${release()} ${process.arch}`,
    cpu: cpus()[0]?.model.trim() ?? "unknown",
    memoryGB: Math.round(totalmem() / 2 ** 30),
    node: process.version,
    pixi: version("pixi.js"),
    spryte: `${version("spryte")} (${git("rev-parse --short HEAD")}${git("status --porcelain -- ../../packages/spryte") ? ", modified" : ""})`,
    power: power(),
    note: process.env.BENCH_NOTE ?? "",
  },
  method: {
    budgetMs: FRAME_BUDGET_MS,
    framesPerCount: 100,
    warmupFrames: 20,
    timing: "simulation through GPU completion (1-pixel readback); median per count per round, then median across rounds",
    parity: {
      counts: PARITY_COUNTS,
      tolerance: PARITY_TOLERANCE,
      reference: SCENES[scene].reference,
      gate: { coveragePercent: COVERAGE_RANGE, maxInteriorDifferingPercent: MAX_INTERIOR_PERCENT },
    },
    publishedCounts: PUBLISHED,
  },
  results,
};
const outDir = join(root, "results");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${report.date.slice(0, 10)}-${process.platform}-${scene}.json`);
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);

// A markdown table for the docs: median frame (min–max across rounds).
const show = [10_000, 50_000, 200_000];
const cell = (r, n) => {
  const c = r.counts.find((x) => x.count === n);
  return c ? `${c.frameMs.toFixed(1)} ms (${c.minFrameMs.toFixed(1)}–${c.maxFrameMs.toFixed(1)})` : "n/a";
};
console.log(`\n${scene}: ${rounds} rounds · ${report.environment.gpu} · ${report.environment.browser} · ${report.environment.cpu}\n`);
console.log(`| Renderer | Max @60fps | ${show.map((n) => `${n / 1000}k`).join(" | ")} | Parity |`);
console.log(`| --- | --- | ${show.map(() => "---").join(" | ")} | --- |`);
for (const r of results)
  console.log(
    `| ${r.renderer} | ${r.maxAt60fps.toLocaleString("en")} | ${show.map((n) => cell(r, n)).join(" | ")} | ${PARITY_COUNTS.map((n) => `${n / 1000}k: ${r.parity[n].coveragePercent}% coverage, ${r.parity[n].interiorDifferingPercent}% inside`).join("; ")} |`,
  );
console.log(`\nSaved ${file}`);
