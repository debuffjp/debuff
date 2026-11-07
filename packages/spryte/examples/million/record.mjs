// Measures the million-boid demo and records a clip of it, on a machine with a real GPU.
//   npm run build -w spryte && npx vite build packages/spryte/examples/million --outDir dist-million
//   node packages/spryte/examples/million/record.mjs [dist-million] [out.mp4]
// Needs playwright-core, Chrome or Chromium (CHROME=/path/to/chrome to choose one) and ffmpeg with libx264 on PATH.
// 1. Live: loads the page as a visitor would and reports fps over 8 s for 1M, 250k and 50k boids.
// 2. Clip: ?capture=1 steps the flock exactly 1/60 s per video frame and draws it on request, so a
//    10 s 1920×1080 clip at 60 fps (600 frames) moves in real time whatever the recording machine's speed.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const dist = resolve(process.argv[2] ?? "dist-million");
const out = resolve(process.argv[3] ?? "spryte-million-boids.mp4");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

// A static server with the isolation headers the page needs for shared memory (what a real host must send too).
const server = createServer(async (req, res) => {
  const raw = new URL(req.url, "http://x").pathname;
  const path = raw === "/" ? "/index.html" : raw;
  try {
    const body = await readFile(join(dist, path));
    res.writeHead(200, {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "credentialless",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const origin = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: "chrome" }),
  args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-gl=angle"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("pageerror", e.message));

const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "no WebGL2";
});
console.log(`GPU renderer: ${renderer}`);
if (/swiftshader|llvmpipe|software/i.test(renderer)) console.warn("This is a software renderer: the fps below are not GPU numbers.");

for (const n of [1_000_000, 250_000, 50_000]) {
  await page.goto(`${origin}?n=${n}`);
  await page.waitForFunction(() => (window.__stats?.frames ?? 0) > 5, null, { timeout: 120_000 });
  const a = await page.evaluate(() => ({ frames: window.__stats.frames, at: performance.now() }));
  await page.waitForTimeout(8000);
  const s = await page.evaluate(
    (a) => ({
      ...window.__stats,
      fps: ((window.__stats.frames - a.frames) * 1000) / (performance.now() - a.at),
      isolated: crossOriginIsolated,
    }),
    a,
  );
  console.log(
    `live n=${n}: ${s.fps.toFixed(1)} fps over 8 s, simulate ${s.simMs.toFixed(1)} ms, draw ${s.drawMs.toFixed(1)} ms, ${s.kind}, ${s.workers} workers, isolated=${s.isolated}`,
  );
}

await page.goto(`${origin}?capture=1`);
await page.waitForFunction(() => typeof window.__frame === "function");
const ff = spawn(
  "ffmpeg",
  [
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    "60",
    "-c:v",
    "mjpeg",
    "-i",
    "-",
    "-c:v",
    "libx264",
    "-crf",
    "16",
    "-preset",
    "slow",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: ["pipe", "ignore", "inherit"] },
);
const t0 = Date.now();
for (let i = 0; i < 600; i++) {
  await page.evaluate(() => window.__frame());
  const jpg = await page.screenshot({ type: "jpeg", quality: 95 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 100 === 0) console.log(`frame ${i} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
ff.stdin.end();
const code = await new Promise((r) => ff.on("close", r));
console.log(`ffmpeg exit ${code}; clip: ${out}`);
await browser.close();
server.close();
process.exit(code ? 1 : 0);
