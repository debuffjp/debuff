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
// ?bg=ink|dusk|forest puts a soft gradient behind the flock instead of flat black (for clips). Off by default.
const BACKDROPS: Record<string, { clear: string; edge: string; core: string; at: string; reach: string }> = {
  ink: { clear: "#05060d", edge: "vec3(0.020, 0.024, 0.051)", core: "vec3(0.082, 0.102, 0.227)", at: "vec2(0.5, 0.42)", reach: "0.95" },
  dusk: { clear: "#0d1030", edge: "vec3(0.051, 0.063, 0.188)", core: "vec3(0.231, 0.090, 0.231)", at: "vec2(0.5, 0.95)", reach: "1.25" },
  forest: { clear: "#060a05", edge: "vec3(0.024, 0.039, 0.020)", core: "vec3(0.078, 0.129, 0.059)", at: "vec2(0.5, 0.45)", reach: "0.95" },
};
const backdrop = BACKDROPS[params.get("bg") ?? ""];

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const count = document.querySelector("#count") as HTMLElement;
const stats = document.querySelector("#stats") as HTMLElement;
const draw = createRenderer(canvas);
// One rect with a smooth falloff. A dark gradient bands badly once it's encoded to 8-bit video, so a little
// noise is added: it breaks the steps up, and the eye reads it as grain.
const backdropShader = backdrop
  ? draw.createShader(`
  vec4 effect(vec4 color, vec2 uv) {
    vec2 p = frameUv();
    float d = length((p - ${backdrop.at}) * vec2(1.7778, 1.0));
    vec3 col = mix(${backdrop.edge}, ${backdrop.core}, pow(1.0 - smoothstep(0.0, ${backdrop.reach}, d), 1.4));
    float n = fract(sin(dot(p * vec2(1920.0, 1080.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    return vec4(col + n * 0.0075, 1.0);
  }`)
  : undefined;

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
  draw.begin(backdrop?.clear ?? "#0b0d09", width, height, dpr);
  if (backdropShader) draw.withShader(backdropShader, () => draw.rect(0, 0, width, height, "#fff"));
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
