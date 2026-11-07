// A million boids in one draw.sprites call. Workers simulate the flock in shared memory (see sim.ts); the
// page draws each finished step, then starts the next one, so simulation and drawing overlap.
// ?n=250000 changes the count. ?capture=1 steps exactly 1/60 s per frame on request, for recording a clip
// frame by frame: there the fps line is hidden, since it would only measure the recorder.
import { createRenderer } from "spryte";
import { allocate, type Buffers, CELL, gridSize, reduce, type StepParams, seed, stepHere } from "./sim.js";

// Seeded, so a recorded clip is the same every time.
let jitterState = 7;
const jitter = () => {
  jitterState = (Math.imul(jitterState, 1664525) + 1013904223) >>> 0;
  return jitterState / 4294967296;
};

const params = new URLSearchParams(location.search);
const N = Math.max(1, Math.min(4_000_000, Number(params.get("n")) || 1_000_000));
const capture = params.has("capture");

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const count = document.querySelector("#count") as HTMLElement;
const stats = document.querySelector("#stats") as HTMLElement;
const draw = createRenderer(canvas);

// A 2×2 dot: at this density, birds read as a murmuration, not as arrows.
const dot = new OffscreenCanvas(2, 2);
(dot.getContext("2d") as OffscreenCanvasRenderingContext2D).fillStyle = "#fff";
(dot.getContext("2d") as OffscreenCanvasRenderingContext2D).fillRect(0, 0, 2, 2);

const width = canvas.clientWidth;
const height = canvas.clientHeight;
const dpr = capture ? 1 : Math.min(devicePixelRatio, 2);
canvas.width = Math.round(width * dpr);
canvas.height = Math.round(height * dpr);
draw.resize(canvas.width, canvas.height);
const { cols, rows } = gridSize(width, height);

// Workers need shared memory, which needs a cross-origin isolated page; without it, one thread does it all.
const threads = crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 0;
const b: Buffers = allocate(N, cols * rows, Math.max(1, threads), threads > 0);
seed(b, N, width, height);
const workers = Array.from({ length: threads }, () => {
  const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  w.postMessage({ buffers: b });
  return w;
});
const phase = (name: "bin" | "move", p: StepParams) =>
  Promise.all(
    workers.map(
      (w, k) =>
        new Promise<void>((done) => {
          const per = Math.ceil(N / workers.length);
          w.onmessage = () => done();
          w.postMessage({ phase: name, p, start: k * per, end: Math.min(N, (k + 1) * per), slot: k });
        }),
    ),
  );

// The title block and the logo are HTML over the canvas: the flock keeps clear of them so the text stays readable.
const keep: number[] = [];
for (const el of document.querySelectorAll<HTMLElement>("#hud, #brand")) {
  const r = el.getBoundingClientRect();
  keep.push(r.left - 24, r.top - 24, r.right + 24, r.bottom + 24);
}

const scare = { x: Number.NaN, y: Number.NaN };
canvas.addEventListener("pointermove", (e) => {
  scare.x = e.offsetX;
  scare.y = e.offsetY;
});
canvas.addEventListener("pointerleave", () => {
  scare.x = Number.NaN;
});

let t = 0;
async function step(dt: number): Promise<number> {
  const t0 = performance.now();
  const p: StepParams = {
    n: N,
    width,
    height,
    cols,
    rows,
    dt,
    t,
    scareX: scare.x,
    scareY: scare.y,
    gridX: jitter() * CELL,
    gridY: jitter() * CELL,
    keep,
  };
  t += dt;
  if (workers.length) {
    await phase("bin", p);
    reduce(b, p, workers.length);
    await phase("move", p);
  } else stepHere(b, p);
  return performance.now() - t0;
}

function render(): number {
  const t0 = performance.now();
  draw.begin("#0b0d09", width, height, dpr);
  draw.sprites(dot, b.pos, N, undefined, { color: b.colors });
  draw.end();
  return performance.now() - t0;
}

count.textContent = `${N.toLocaleString("en")} boids`;
const where = `${draw.kind === "webgl2" ? "WebGL2" : "Canvas 2D"} · ${workers.length ? `${workers.length} workers` : "1 thread"}`;
const live = { fps: 0, simMs: 0, drawMs: 0, n: N, kind: draw.kind, workers: workers.length, frames: 0 };
(window as unknown as { __stats: typeof live }).__stats = live;

if (capture) {
  stats.textContent = `drawn by spryte · one draw.sprites call · ${draw.kind === "webgl2" ? "WebGL2" : "Canvas 2D"}`;
  // The recorder calls this once per video frame: fixed steps, then one draw.
  // `steps` 1/60 s steps per video frame: 2 for a 30 fps clip that still moves in real time.
  (window as unknown as { __frame: (steps?: number) => Promise<void> }).__frame = async (steps = 1) => {
    for (let i = 0; i < steps; i++) await step(1 / 60);
    render();
  };
} else {
  let pending: Promise<number> | undefined;
  let last = performance.now();
  let frames = 0;
  let since = last;
  const frame = async (now: number) => {
    requestAnimationFrame(frame);
    if (pending) return; // the last step isn't done: keep the frame on screen, don't queue another
    live.drawMs = render();
    frames++;
    live.frames++;
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    pending = step(dt);
    live.simMs = await pending;
    pending = undefined;
    if (now - since > 500) {
      live.fps = (frames * 1000) / (now - since);
      frames = 0;
      since = now;
      stats.textContent = `${Math.round(live.fps)} fps · simulate ${live.simMs.toFixed(1)} ms · draw ${live.drawMs.toFixed(1)} ms · ${where}`;
    }
  };
  requestAnimationFrame(frame);
}
