// A lens over NASA's 32,050 recorded meteorite landings: the meteorites under it fly off the map
// and stack into a histogram of their mass. Every point moves every frame, all drawn with one
// sprites() call. Data: NASA Open Data Portal, from The Meteoritical Society (see convert.mjs).
import { createRenderer, ring } from "spryte";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
// ?backend=2d forces the Canvas 2D fallback, to compare the two.
const draw = createRenderer(canvas, {
  backend: new URLSearchParams(location.search).get("backend") === "2d" ? "2d" : "auto",
});
const BINS = 40;
const FELL = 0xffc94dff; // seen falling
const FOUND = 0x5ab4ffff; // found later
const MIN_LOG = -2; // 0.01 g
const MAX_LOG = 8; // 100 t

// meteorites.bin: see convert.mjs for the layout.
const data = await (await fetch(new URL("./meteorites.bin", import.meta.url))).arrayBuffer();
const N = new DataView(data).getUint32(0, true);
const lon = new Int16Array(data, 4, N);
const lat = new Int16Array(data, 4 + N * 2, N);
const logMass = new Uint16Array(data, 4 + N * 4, N);
const fell = new Uint8Array(data, 4 + N * 6, N);
const homeX = new Float32Array(N); // 0-1 across the map
const homeY = new Float32Array(N);
const value = new Float32Array(N); // 0-1 along the mass axis
const color = new Uint32Array(N);
for (let i = 0; i < N; i++) {
  homeX[i] = (lon[i] / 100 + 180) / 360;
  homeY[i] = (90 - lat[i] / 100) / 180;
  value[i] = Math.min(0.999, (logMass[i] / 1000 - 2 - MIN_LOG) / (MAX_LOG - MIN_LOG));
  color[i] = fell[i] ? FELL : FOUND;
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
  const plotY = pad + 40;
  const plotW = w - pad * 2;
  // The map keeps the 2:1 shape of an equirectangular projection, centred above the histogram.
  const mapH = Math.min((h - plotY) * 0.68 - pad, plotW / 2);
  const mapW = mapH * 2;
  const mapX = plotX + (plotW - mapW) / 2;
  const plotH = mapH;
  const histTop = plotY + plotH + pad * 1.5;
  const histH = Math.min(h - histTop - pad - 16, Math.max(120, mapH));
  const colW = plotW / BINS;

  // Pass 1: which points the lens covers, binned by value.
  counts.fill(0);
  const r2 = lens.r * lens.r;
  let selected = 0;
  for (let i = 0; i < N; i++) {
    const dx = mapX + homeX[i] * mapW - lens.x;
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
      tx = mapX + homeX[i] * mapW;
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
  draw.text("0.01 g", plotX, histTop + histH + 8, { font: "12px sans-serif", color: "#888" });
  draw.text("mass (log scale)", plotX + plotW / 2, histTop + histH + 8, { font: "12px sans-serif", color: "#888", align: "center" });
  draw.text("100 t", plotX + plotW, histTop + histH + 8, { font: "12px sans-serif", color: "#888", align: "right" });
  draw.text(
    `${N.toLocaleString()} meteorites · ${selected.toLocaleString()} under the lens · ${Math.round(fps)} fps · ${draw.kind} · ${draw.drawCalls} draw calls`,
    pad,
    pad - 8,
    { font: "13px sans-serif", color: "#ccc" },
  );
  draw.text("yellow: seen falling · blue: found later · move the lens, scroll to resize", pad, pad + 10, {
    font: "13px sans-serif",
    color: "#888",
  });
  draw.text("Data: NASA Open Data Portal, The Meteoritical Society", w - pad, h - 6, {
    font: "11px sans-serif",
    color: "#666",
    align: "right",
    baseline: "bottom",
  });
  draw.end();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
