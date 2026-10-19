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
const PARITY_COUNT = 2_000;
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
  // 1. Parity: every renderer draws the same seeded frame; compare each to the reference.
  const snaps = {};
  for (const renderer of renderers) {
    const page = await open(renderer);
    if (gpu === "unknown")
      gpu = await page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
      });
    const snap = await page.evaluate((n) => window.__bench.snapshot(n), PARITY_COUNT);
    snaps[renderer] = Buffer.from(snap.rgba, "base64");
    await page.close();
  }
  const ref = snaps[SCENES[scene].reference] ?? snaps[renderers[0]];
  for (const renderer of renderers) {
    const px = snaps[renderer];
    let differ = 0;
    let drawn = 0;
    // Coverage: pixels this renderer drew vs the reference. Skipped or culled sprites would show here.
    let own = 0;
    let refOwn = 0;
    for (let i = 0; i < ref.length; i += 4) {
      // Background is #11140d; count pixels either renderer drew on.
      const bgA = ref[i] === 0x11 && ref[i + 1] === 0x14 && ref[i + 2] === 0x0d;
      const bgB = px[i] === 0x11 && px[i + 1] === 0x14 && px[i + 2] === 0x0d;
      if (!bgB) own++;
      if (!bgA) refOwn++;
      if (bgA && bgB) continue;
      drawn++;
      if (Math.max(Math.abs(ref[i] - px[i]), Math.abs(ref[i + 1] - px[i + 1]), Math.abs(ref[i + 2] - px[i + 2])) > PARITY_TOLERANCE)
        differ++;
    }
    parity[renderer] = {
      drawnPixels: drawn,
      differingPixels: differ,
      differingPercent: drawn ? +((100 * differ) / drawn).toFixed(2) : 0,
      coveragePercent: refOwn ? +((100 * own) / refOwn).toFixed(1) : 0,
    };
    // PARITY_DUMP=1 writes the frames as PNGs (and a diff in red) to results/parity/ for a look.
    if (process.env.PARITY_DUMP) await dump(renderer, px, ref);
    console.log(
      `parity ${renderer.padEnd(14)} ${parity[renderer].differingPercent}% of ${drawn} drawn pixels differ from ${SCENES[scene].reference}, coverage ${parity[renderer].coveragePercent}%`,
    );
  }

  // 2. Timing: rounds interleave renderers in a rotating order, so heat and ordering spread evenly.
  for (let round = 0; round < rounds; round++) {
    const order = renderers.map((_, i) => renderers[(i + round) % renderers.length]);
    for (const renderer of order) {
      const page = await open(renderer);
      for (const count of COUNTS) {
        const r = await page.evaluate((n) => window.__bench.measure(n), count);
        samples[renderer][count] ??= [];
        samples[renderer][count].push(r);
        if (r.frameMs > FRAME_BUDGET_MS) break;
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
    parity: { count: PARITY_COUNT, tolerance: PARITY_TOLERANCE, reference: SCENES[scene].reference },
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
    `| ${r.renderer} | ${r.maxAt60fps.toLocaleString("en")} | ${show.map((n) => cell(r, n)).join(" | ")} | ${r.parity.coveragePercent}% coverage, ${r.parity.differingPercent}% px differ |`,
  );
console.log(`\nSaved ${file}`);
