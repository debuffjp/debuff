// River mode: a particle fluid in side view. Water pours in upstream, runs along a shelf, goes over
// the falls into a basin, and leaves over a weir to come round again. Particles push on their
// neighbours (double density relaxation, Clavet et al. 2005), so the water pools, sloshes and
// piles up behind the rocks you drag into it. Neighbours come from a uniform grid rebuilt every
// step with a counting sort, so nothing allocates per frame.

const H = 9; // interaction radius in world units
const REST = 4.2; // rest density
const STIFF = 0.025;
const STIFF_NEAR = 0.15;
const GRAVITY = 0.12; // world units per step²
const MAX_FLUID = 200_000;
// The scene is laid out for BASE particles. More particles than that would overfill the basin and
// blow the fluid apart, so the whole scene grows by k = sqrt(count / BASE) instead (the camera
// zooms out to fit), keeping the water at the same density at any count.
const BASE = 14_000;
const MAX_K = Math.sqrt(MAX_FLUID / BASE);
let k = 1;
let WORLD_W = 720;
let WORLD_H = 400;
let LIP_X = 380;
let FLOOR = WORLD_H - 12;
let WEIR_X = WORLD_W - 70;
let WEIR_TOP = FLOOR - 70;
let WEIR_W = 14;
const shelf = (x: number): number => (150 + (x / k) * 0.06) * k; // top of the upstream shelf
function setScale(next: number): void {
  if (next === k) return;
  const f = next / k;
  for (const r of rocks) {
    r.x *= f;
    r.y *= f;
    r.r *= f;
  }
  for (let i = 0; i < live; i++) {
    x[i] *= f;
    y[i] *= f;
    prevX[i] *= f;
    prevY[i] *= f;
  }
  k = next;
  WORLD_W = 720 * k;
  WORLD_H = 400 * k;
  LIP_X = 380 * k;
  FLOOR = WORLD_H - 12 * k;
  WEIR_X = WORLD_W - 70 * k;
  WEIR_TOP = FLOOR - 70 * k;
  WEIR_W = 14 * k;
  GW = Math.ceil(WORLD_W / H) + 2;
  GH = Math.ceil(WORLD_H / H) + 2;
  CELLS = GW * GH;
}

export const positions = new Float32Array(MAX_FLUID * 2); // backing pixels, for drawing
export const colors = new Uint32Array(MAX_FLUID);
export const scales = new Float32Array(MAX_FLUID);
export const timing = { sim: 0, pairs: 0 };

const x = new Float32Array(MAX_FLUID);
const y = new Float32Array(MAX_FLUID);
const vx = new Float32Array(MAX_FLUID);
const vy = new Float32Array(MAX_FLUID);
const prevX = new Float32Array(MAX_FLUID);
const prevY = new Float32Array(MAX_FLUID);
let live = 0; // particles emitted so far, up to the requested count

// The grid: cells of size H over the world, plus a margin for particles thrown past the edges.
let GW = Math.ceil(WORLD_W / H) + 2;
let GH = Math.ceil(WORLD_H / H) + 2;
let CELLS = GW * GH;
// Sized for the largest scene, so growing it never reallocates.
const MAX_CELLS = (Math.ceil((720 * MAX_K) / H) + 3) * (Math.ceil((400 * MAX_K) / H) + 3);
const cellStart = new Int32Array(MAX_CELLS + 1);
const cursor = new Int32Array(MAX_CELLS + 1);
const cellOf = new Int32Array(MAX_FLUID);
const sorted = new Int32Array(MAX_FLUID);
// Scratch for reordering the particle arrays into cell order after each grid build.
const scratch = new Float32Array(MAX_FLUID);
const scratchCells = new Int32Array(MAX_FLUID);
const fields = [x, y, vx, vy, prevX, prevY];
// One particle's neighbours, found in pass 1 and reused in pass 2.
const MAX_NEIGHBOURS = 96;
const nbJ = new Int32Array(MAX_NEIGHBOURS);
const nbQ = new Float32Array(MAX_NEIGHBOURS);
const nbX = new Float32Array(MAX_NEIGHBOURS);
const nbY = new Float32Array(MAX_NEIGHBOURS);

export interface Rock {
  x: number;
  y: number;
  r: number;
}
export const rocks: Rock[] = [
  { x: 250, y: 132, r: 20 },
  { x: 520, y: FLOOR - 26, r: 26 },
  { x: 600, y: 60, r: 18 },
  { x: 660, y: 60, r: 24 },
];

// Water colours, slow to fast; replaced by setPalette().
let ramp: number[] = [0x1e3a8a, 0x2f7fd0, 0x38bdf8, 0xc8f1ff, 0xffffff];
export function setPalette(stops: number[]): void {
  ramp = stops;
}

function emit(i: number): void {
  x[i] = (6 + Math.random() * 30) * k;
  y[i] = (60 + Math.random() * 60) * k;
  vx[i] = 1.6 + Math.random() * 0.4;
  vy[i] = 0;
  prevX[i] = x[i];
  prevY[i] = y[i];
}

function collide(i: number): void {
  let px = x[i];
  let py = y[i];
  // World edges: the left wall and the floor. The right side is open past the weir.
  if (px < 2) px = 2;
  if (py > FLOOR) py = FLOOR;
  if (py < -200) py = -200;
  // The shelf is solid below its top, left of the lip.
  if (px < LIP_X) {
    const top = shelf(px);
    if (py > top) {
      if (LIP_X - px < py - top) px = LIP_X;
      else py = top;
    }
  }
  // The weir: a solid block near the right edge.
  if (px > WEIR_X && px < WEIR_X + WEIR_W && py > WEIR_TOP) {
    const dLeft = px - WEIR_X;
    const dRight = WEIR_X + WEIR_W - px;
    const dTop = py - WEIR_TOP;
    if (dTop < dLeft && dTop < dRight) py = WEIR_TOP;
    else if (dLeft < dRight) px = WEIR_X;
    else px = WEIR_X + WEIR_W;
  }
  for (const r of rocks) {
    const dx = px - r.x;
    const dy = py - r.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < r.r * r.r) {
      const d = Math.sqrt(d2) || 1;
      px = r.x + (dx / d) * r.r;
      py = r.y + (dy / d) * r.r;
    }
  }
  x[i] = px;
  y[i] = py;
}

function buildGrid(n: number): void {
  cellStart.fill(0, 0, CELLS + 1);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(GW - 1, Math.max(0, Math.floor(x[i] / H) + 1));
    const cy = Math.min(GH - 1, Math.max(0, Math.floor(y[i] / H) + 1));
    const c = cy * GW + cx;
    cellOf[i] = c;
    cellStart[c + 1]++;
  }
  for (let c = 0; c < CELLS; c++) cellStart[c + 1] += cellStart[c];
  cursor.set(cellStart);
  for (let i = 0; i < n; i++) sorted[cursor[cellOf[i]]++] = i;
  if (!reorder) return;
  // Move every particle to its sorted slot, so a cell's particles sit next to each other in memory
  // and the neighbour loops read memory in order instead of jumping around.
  for (const a of fields) {
    for (let s = 0; s < n; s++) scratch[s] = a[sorted[s]];
    a.set(scratch.subarray(0, n));
  }
  for (let s = 0; s < n; s++) scratchCells[s] = cellOf[sorted[s]];
  cellOf.set(scratchCells.subarray(0, n));
  for (let s = 0; s < n; s++) sorted[s] = s;
}

// ?reorder=0 turns the reordering off, to compare.
const reorder = new URLSearchParams(location.search).get("reorder") !== "0";

function relax(n: number): number {
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    const c = cellOf[i];
    let density = 0;
    let near = 0;
    let found = 0;
    // Pass 1: density and near density from neighbours within H, remembering each neighbour, its
    // q and its direction so pass 2 doesn't search or take square roots again.
    for (let oy = -GW; oy <= GW; oy += GW) {
      for (let ox = -1; ox <= 1; ox++) {
        const cell = c + oy + ox;
        if (cell < 0 || cell >= CELLS) continue;
        for (let s = cellStart[cell]; s < cellStart[cell + 1]; s++) {
          const j = sorted[s];
          if (j === i) continue;
          const dx = x[j] - xi;
          const dy = y[j] - yi;
          const d2 = dx * dx + dy * dy;
          if (d2 >= H * H || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const q = 1 - d / H;
          density += q * q;
          near += q * q * q;
          if (found < MAX_NEIGHBOURS) {
            nbJ[found] = j;
            nbQ[found] = q;
            nbX[found] = dx / d;
            nbY[found] = dy / d;
            found++;
          }
        }
      }
    }
    const pressure = STIFF * (density - REST);
    const pressureNear = STIFF_NEAR * near;
    // Pass 2: push neighbours apart (or pull them together) in proportion to the pressure.
    let mx = 0;
    let my = 0;
    pairs += found;
    for (let k = 0; k < found; k++) {
      const q = nbQ[k];
      const push = (pressure * q + pressureNear * q * q) * 0.5;
      const ux = nbX[k] * push;
      const uy = nbY[k] * push;
      const j = nbJ[k];
      x[j] += ux;
      y[j] += uy;
      mx -= ux;
      my -= uy;
    }
    x[i] += mx;
    y[i] += my;
  }
  return pairs;
}

let accumulator = 0;
let view = { s: 1, ox: 0, oy: 0 };

/** Simulates the water and places it on screen; returns how many copies to draw. */
export function step(
  n: number,
  dt: number,
  _now: number,
  W: number,
  Hpx: number,
  _dpr: number,
  _camera: unknown,
  reducedMotion: boolean,
): number {
  const t0 = performance.now();
  const count = Math.min(n, MAX_FLUID);
  setScale(Math.max(1, Math.sqrt(count / BASE)));
  // Pour in new water a few hundred particles per frame until the count is reached.
  const pour = Math.max(0, Math.min(count - live, Math.round(400 * k * k)));
  for (let k = 0; k < pour; k++) emit(live++);
  if (live > count) live = count;

  accumulator += dt * (reducedMotion ? 0.5 : 1);
  let steps = 0;
  // Two steps to catch up after a slow frame, but only while steps are cheap: when the simulation
  // is the bottleneck a second step would just make the next frame slower still.
  const maxSteps = timing.sim > 12 ? 1 : 2;
  while (accumulator >= 1 / 60 && steps < maxSteps) {
    accumulator -= 1 / 60;
    steps++;
    for (let i = 0; i < live; i++) {
      vy[i] += GRAVITY;
      prevX[i] = x[i];
      prevY[i] = y[i];
      x[i] += vx[i];
      y[i] += vy[i];
    }
    buildGrid(live);
    timing.pairs = relax(live);
    for (let i = 0; i < live; i++) {
      collide(i);
      vx[i] = (x[i] - prevX[i]) * 0.998;
      vy[i] = (y[i] - prevY[i]) * 0.998;
      // Past the weir and off the right edge: back to the start.
      if (x[i] > WORLD_W + 10 || y[i] > WORLD_H + 40) emit(i);
    }
  }
  if (accumulator > 1 / 60) accumulator = 0; // behind: drop the time (slow motion) rather than spiral

  // Fit the world to the canvas.
  const s = Math.min(W / WORLD_W, Hpx / WORLD_H);
  const ox = (W - WORLD_W * s) / 2;
  const oy = (Hpx - WORLD_H * s) / 2;
  view = { s, ox, oy };
  const size = (H * 0.7 * s) / 16; // the disc sprite is 16 px
  const last = ramp.length - 1;
  for (let i = 0; i < live; i++) {
    positions[i * 2] = ox + x[i] * s;
    positions[i * 2 + 1] = oy + y[i] * s;
    scales[i] = size;
    const speed = Math.min(0.999, Math.hypot(vx[i], vy[i]) / 4);
    colors[i] = ((ramp[Math.floor(speed * (last + 1))] << 8) | 0xb0) >>> 0;
  }
  timing.sim += (performance.now() - t0 - timing.sim) * 0.05;
  return live;
}

interface SceneDraw {
  rect(x: number, y: number, w: number, h: number, color: string): void;
  circle(x: number, y: number, r: number, color: string): void;
}

/** Draws the shelf, cliff, basin, weir and rocks behind the water, in backing pixels. */
export function drawScene(draw: SceneDraw, poly: (points: number[], color: string) => void): void {
  const { s, ox, oy } = view;
  const X = (wx: number): number => ox + wx * s;
  const Y = (wy: number): number => oy + wy * s;
  const ground = "#3b4630";
  poly([X(0), Y(shelf(0)), X(LIP_X), Y(shelf(LIP_X)), X(LIP_X), Y(WORLD_H), X(0), Y(WORLD_H)], ground);
  draw.rect(X(0), Y(FLOOR), WORLD_W * s, (WORLD_H - FLOOR) * s, ground);
  draw.rect(X(WEIR_X), Y(WEIR_TOP), WEIR_W * s, (FLOOR - WEIR_TOP) * s, ground);
  for (const r of rocks) draw.circle(X(r.x), Y(r.y), r.r * s, r === held ? "#a3ab96" : "#6b7360");
}

// Dragging rocks: pick the one under the pointer and move it there on each move.
let held: Rock | null = null;
function toWorld(px: number, py: number): [number, number] {
  return [(px - view.ox) / view.s, (py - view.oy) / view.s];
}
export function grab(px: number, py: number): boolean {
  const [wx, wy] = toWorld(px, py);
  held = rocks.find((r) => Math.hypot(r.x - wx, r.y - wy) < r.r + 6) ?? null;
  return held !== null;
}
export function drag(px: number, py: number): void {
  if (!held) return;
  const [wx, wy] = toWorld(px, py);
  held.x = Math.max(held.r, Math.min(WORLD_W - held.r, wx));
  held.y = Math.max(held.r, Math.min(FLOOR, wy));
}
export function release(): void {
  held = null;
}

/** Live particle count and neighbour pairs, for the stats line. */
export function census(): string {
  return `fluid ${live.toLocaleString()}, ${(timing.pairs / 1e6).toFixed(2)}M neighbour pairs per step`;
}
