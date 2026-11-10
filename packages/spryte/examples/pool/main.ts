// Bouncing sprites drawn two ways, to compare a SpritePool with a draw.sprite loop.
// ?n=200000 sets the count, ?mode=loop draws with draw.sprite. Click to remove a tenth of them and add them back.
import { createRenderer } from "spryte";
import { SpritePool } from "./pool.js";

const params = new URLSearchParams(location.search);
const N = Math.max(1, Number(params.get("n")) || 100_000);
const loop = params.get("mode") === "loop";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const stats = document.querySelector("#stats") as HTMLElement;
const draw = createRenderer(canvas);

const dot = new OffscreenCanvas(8, 8);
const g = dot.getContext("2d") as OffscreenCanvasRenderingContext2D;
g.fillStyle = "#fff";
g.fillRect(1, 0, 6, 8);
g.fillRect(0, 1, 8, 6);

const W = canvas.clientWidth;
const H = canvas.clientHeight;
canvas.width = W;
canvas.height = H;
draw.resize(W, H);

const pool = new SpritePool(dot, { color: true });
let vx = new Float32Array(1024);
let vy = new Float32Array(1024);
const COLORS = [0xcffb2dff, 0xffffffff, 0x38bdf8ff, 0xfbbf24ff];

function spawn(): void {
  const h = pool.add(Math.random() * W, Math.random() * H);
  const s = pool.slot(h);
  if (s >= vx.length) {
    const nx = new Float32Array(vx.length * 2);
    const ny = new Float32Array(vx.length * 2);
    nx.set(vx);
    ny.set(vy);
    vx = nx;
    vy = ny;
  }
  vx[s] = (Math.random() - 0.5) * 200;
  vy[s] = (Math.random() - 0.5) * 200;
  (pool.color as Uint32Array)[s] = COLORS[s & 3] as number;
}
for (let i = 0; i < N; i++) spawn();

// Velocities live beside the pool by slot, so removing swaps them too.
function despawn(handle: number): void {
  const s = pool.slot(handle);
  const last = pool.count - 1;
  vx[s] = vx[last] as number;
  vy[s] = vy[last] as number;
  pool.remove(handle);
}

canvas.addEventListener("click", () => {
  const k = Math.floor(pool.count / 10);
  for (let i = 0; i < k; i++) despawn(pool.handle(Math.floor(Math.random() * pool.count)));
  for (let i = 0; i < k; i++) spawn();
});

const opts = [0xcffb2dff, 0xffffffff, 0x38bdf8ff, 0xfbbf24ff].map((c) => ({ tint: `#${(c >>> 8).toString(16).padStart(6, "0")}` }));
let last = performance.now();
let acc = 0;
let frames = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const p = pool.positions;
  for (let s = 0; s < pool.count; s++) {
    let x = (p[s * 2] as number) + (vx[s] as number) * dt;
    let y = (p[s * 2 + 1] as number) + (vy[s] as number) * dt;
    if (x < 0 || x > W) vx[s] = -(vx[s] as number);
    if (y < 0 || y > H) vy[s] = -(vy[s] as number);
    x = Math.max(0, Math.min(W, x));
    y = Math.max(0, Math.min(H, y));
    p[s * 2] = x;
    p[s * 2 + 1] = y;
  }
  const t0 = performance.now();
  draw.begin("#0d0f0a", W, H, 1);
  if (loop) for (let s = 0; s < pool.count; s++) draw.sprite(dot, p[s * 2] as number, p[s * 2 + 1] as number, opts[s & 3]);
  else pool.draw(draw);
  draw.end();
  acc += performance.now() - t0;
  if (++frames === 60) {
    stats.textContent = `${pool.count} sprites, ${loop ? "draw.sprite loop" : "SpritePool"}: ${(acc / 60).toFixed(2)} ms to draw`;
    acc = 0;
    frames = 0;
  }
  if (!bench) requestAnimationFrame(frame);
}

// ?bench draws 120 frames back to back and reports the median draw time, for runs in a background tab.
const bench = params.has("bench");
if (bench) {
  setTimeout(() => {
    const times: number[] = [];
    for (let i = 0; i < 120; i++) {
      const t0 = performance.now();
      frame(t0);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    stats.textContent = `${pool.count} sprites, ${loop ? "draw.sprite loop" : "SpritePool"}: median frame ${(times[60] as number).toFixed(2)} ms`;
  }, 500);
} else requestAnimationFrame(frame);
