// A lens over 100,000 points: the points under it fly out of the scatter plot and stack into a
// histogram of their values. Every point moves every frame, all drawn with one sprites() call.
import { createRenderer, ring } from "spryte";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
// ?backend=2d forces the Canvas 2D fallback, ?n= changes the point count.
const draw = createRenderer(canvas, { backend: params.get("backend") === "2d" ? "2d" : "auto" });
const N = Math.max(1, Number(params.get("n")) || 100_000);
const BINS = 32;
const COLORS = [0x5ab4ffff, 0xff7a9cff, 0xffc94dff, 0x7be0a6ff, 0xb59cffff];

// Seeded synthetic data: a few clusters, each with its own spread of values (0-1), so the
// histogram changes shape as the lens moves between them.
let seed = 7;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function gauss(): number {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}
// A normal sample redrawn until it lands in [0, 1), so nothing piles up at the edges.
function within(mean: number, spread: number): number {
  for (;;) {
    const v = mean + gauss() * spread;
    if (v >= 0 && v < 1) return v;
  }
}
const clusters = COLORS.map((_, i) => ({
  x: 0.15 + rand() * 0.7,
  y: 0.15 + rand() * 0.7,
  spread: 0.05 + rand() * 0.1,
  value: 0.15 + (i / (COLORS.length - 1)) * 0.7,
}));
const homeX = new Float32Array(N); // 0-1 within the plot
const homeY = new Float32Array(N);
const value = new Float32Array(N);
const color = new Uint32Array(N);
for (let i = 0; i < N; i++) {
  const c = clusters[Math.floor(rand() * clusters.length)];
  homeX[i] = within(c.x, c.spread);
  homeY[i] = within(c.y, c.spread);
  value[i] = within(c.value, 0.12);
  color[i] = COLORS[clusters.indexOf(c)] ?? 0xffffffff;
}

const positions = new Float32Array(N * 2); // current screen position, eased toward a target
const counts = new Uint32Array(BINS);
const filled = new Uint32Array(BINS);
const bin = new Uint8Array(N); // 255: outside the lens

// A 6x6 dot made at runtime, so the example has no assets.
const dot = new OffscreenCanvas(6, 6);
const g = dot.getContext("2d") as OffscreenCanvasRenderingContext2D;
g.fillStyle = "#fff";
g.beginPath();
g.arc(3, 3, 3, 0, Math.PI * 2);
g.fill();

const lens = { x: -1e9, y: -1e9, r: 70 };
canvas.addEventListener("pointermove", (e) => {
  lens.x = e.offsetX;
  lens.y = e.offsetY;
});
canvas.addEventListener("pointerdown", (e) => {
  lens.x = e.offsetX;
  lens.y = e.offsetY;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    lens.r = Math.min(300, Math.max(20, lens.r * Math.exp(-e.deltaY * 0.001)));
  },
  { passive: false },
);

function resize(): number {
  const dpr = devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    draw.resize(w, h);
  }
  return dpr;
}

let last = 0;
let fps = 60;
let started = false;
function frame(ms: number): void {
  const dt = Math.min(0.1, (ms - last) / 1000 || 0);
  last = ms;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;
  const dpr = resize();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pad = 24;
  const plotX = pad;
  const plotY = pad + 20;
  const plotW = w - pad * 2;
  const plotH = (h - plotY) * 0.68 - pad;
  const histTop = plotY + plotH + pad * 1.5;
  const histH = h - histTop - pad;
  const colW = plotW / BINS;

  // Pass 1: which points the lens covers, binned by value.
  counts.fill(0);
  const r2 = lens.r * lens.r;
  let selected = 0;
  for (let i = 0; i < N; i++) {
    const dx = plotX + homeX[i] * plotW - lens.x;
    const dy = plotY + homeY[i] * plotH - lens.y;
    if (dx * dx + dy * dy < r2) {
      const b = Math.floor(value[i] * BINS);
      bin[i] = b;
      counts[b]++;
      selected++;
    } else bin[i] = 255;
  }
  let tallest = 1;
  for (let b = 0; b < BINS; b++) tallest = Math.max(tallest, counts[b]);
  // Dots sit 4 px apart in rows across each column; rows squeeze when the tallest would overflow.
  const across = Math.max(1, Math.floor((colW - 2) / 4));
  const rowStep = Math.min(4, (histH * across) / tallest);

  // Pass 2: ease every point toward its home or its slot in the histogram.
  filled.fill(0);
  const k = started ? 1 - Math.exp(-dt * 9) : 1;
  started = true;
  for (let i = 0; i < N; i++) {
    let tx: number;
    let ty: number;
    const b = bin[i];
    if (b === 255) {
      tx = plotX + homeX[i] * plotW;
      ty = plotY + homeY[i] * plotH;
    } else {
      const slot = filled[b]++;
      tx = plotX + b * colW + 3 + (slot % across) * 4;
      ty = histTop + histH - Math.floor(slot / across) * rowStep;
    }
    const j = i * 2;
    positions[j] = positions[j] + (tx - positions[j]) * k;
    positions[j + 1] = positions[j + 1] + (ty - positions[j + 1]) * k;
  }

  draw.begin("#111", w, h, dpr);
  draw.rect(plotX, histTop + histH + 2, plotW, 1, "#444");
  draw.sprites(dot, positions, N, { scaleX: 0.5, scaleY: 0.5, alpha: 0.75 }, { color });
  if (lens.x > -1e8) ring(draw, lens.x, lens.y, lens.r, 1.5, "#ffffffcc");
  draw.text("value: low", plotX, histTop + histH + 8, { font: "12px sans-serif", color: "#888" });
  draw.text("high", plotX + plotW, histTop + histH + 8, { font: "12px sans-serif", color: "#888", align: "right" });
  draw.text(
    `${N.toLocaleString()} points · ${selected.toLocaleString()} under the lens · ${Math.round(fps)} fps · ${draw.kind} · ${draw.drawCalls} draw calls`,
    pad,
    pad - 8,
    { font: "13px sans-serif", color: "#ccc" },
  );
  draw.text("move to aim the lens, scroll to resize · synthetic data", w - pad, pad - 8, {
    font: "13px sans-serif",
    color: "#777",
    align: "right",
  });
  draw.end();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
