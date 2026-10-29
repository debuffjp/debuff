// The river's particle fluid, with no DOM: it runs in a worker (river-worker.ts) or, with
// ?worker=0, on the main thread. Double density relaxation (Clavet et al. 2005) over a uniform grid
// rebuilt every step with a counting sort; particle arrays are reordered into cell order so the
// neighbour loops read memory in order, and each particle's neighbours are found once per step.

export const H = 9; // interaction radius in world units
const REST = 4.2; // rest density
const STIFF = 0.025;
const STIFF_NEAR = 0.15;
const GRAVITY = 0.12; // world units per step²
export const MAX_FLUID = 200_000;
// The scene is laid out for BASE particles. More would overfill the basin and blow the fluid apart,
// so the whole scene grows by k = sqrt(count / BASE) instead, keeping the water at the same density.
const BASE = 14_000;
const MAX_K = Math.sqrt(MAX_FLUID / BASE);

/** Scene geometry in world units at scale k. Rocks are kept in k = 1 units and scaled here too. */
export function geometry(k: number) {
  const WORLD_W = 720 * k;
  const WORLD_H = 400 * k;
  const FLOOR = WORLD_H - 12 * k;
  return {
    WORLD_W,
    WORLD_H,
    LIP_X: 380 * k,
    FLOOR,
    WEIR_X: WORLD_W - 70 * k,
    WEIR_TOP: FLOOR - 70 * k,
    WEIR_W: 14 * k,
    shelf: (x: number): number => (150 + (x / k) * 0.06) * k,
  };
}
export const scaleFor = (count: number): number => Math.max(1, Math.sqrt(Math.min(count, MAX_FLUID) / BASE));

export interface Rock {
  x: number;
  y: number;
  r: number;
}

export const x = new Float32Array(MAX_FLUID);
export const y = new Float32Array(MAX_FLUID);
export const vx = new Float32Array(MAX_FLUID);
export const vy = new Float32Array(MAX_FLUID);
export const prevX = new Float32Array(MAX_FLUID);
export const prevY = new Float32Array(MAX_FLUID);
export const state = { k: 1, live: 0, pairs: 0, reorder: true };
let g = geometry(1);

let GW = Math.ceil(g.WORLD_W / H) + 2;
let GH = Math.ceil(g.WORLD_H / H) + 2;
let CELLS = GW * GH;
const MAX_CELLS = (Math.ceil((720 * MAX_K) / H) + 3) * (Math.ceil((400 * MAX_K) / H) + 3);
const cellStart = new Int32Array(MAX_CELLS + 1);
const cursor = new Int32Array(MAX_CELLS + 1);
const cellOf = new Int32Array(MAX_FLUID);
const sorted = new Int32Array(MAX_FLUID);
const scratch = new Float32Array(MAX_FLUID);
const scratchCells = new Int32Array(MAX_FLUID);
const fields = [x, y, vx, vy, prevX, prevY];
const MAX_NEIGHBOURS = 96;
const nbJ = new Int32Array(MAX_NEIGHBOURS);
const nbQ = new Float32Array(MAX_NEIGHBOURS);
const nbX = new Float32Array(MAX_NEIGHBOURS);
const nbY = new Float32Array(MAX_NEIGHBOURS);

function setScale(next: number): void {
  if (next === state.k) return;
  const f = next / state.k;
  for (let i = 0; i < state.live; i++) {
    x[i] *= f;
    y[i] *= f;
    prevX[i] *= f;
    prevY[i] *= f;
  }
  state.k = next;
  g = geometry(next);
  GW = Math.ceil(g.WORLD_W / H) + 2;
  GH = Math.ceil(g.WORLD_H / H) + 2;
  CELLS = GW * GH;
}

function emit(i: number): void {
  const k = state.k;
  x[i] = (6 + Math.random() * 30) * k;
  y[i] = (60 + Math.random() * 60) * k;
  vx[i] = 1.6 + Math.random() * 0.4;
  vy[i] = 0;
  prevX[i] = x[i];
  prevY[i] = y[i];
}

function collide(i: number, rocks: Rock[]): void {
  const k = state.k;
  let px = x[i];
  let py = y[i];
  if (px < 2) px = 2;
  if (py > g.FLOOR) py = g.FLOOR;
  if (py < -200) py = -200;
  if (px < g.LIP_X) {
    const top = g.shelf(px);
    if (py > top) {
      if (g.LIP_X - px < py - top) px = g.LIP_X;
      else py = top;
    }
  }
  if (px > g.WEIR_X && px < g.WEIR_X + g.WEIR_W && py > g.WEIR_TOP) {
    const dLeft = px - g.WEIR_X;
    const dRight = g.WEIR_X + g.WEIR_W - px;
    const dTop = py - g.WEIR_TOP;
    if (dTop < dLeft && dTop < dRight) py = g.WEIR_TOP;
    else if (dLeft < dRight) px = g.WEIR_X;
    else px = g.WEIR_X + g.WEIR_W;
  }
  for (const r of rocks) {
    const rx = r.x * k;
    const ry = r.y * k;
    const rr = r.r * k;
    const dx = px - rx;
    const dy = py - ry;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1;
      px = rx + (dx / d) * rr;
      py = ry + (dy / d) * rr;
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
  if (!state.reorder) return;
  for (const a of fields) {
    for (let s = 0; s < n; s++) scratch[s] = a[sorted[s]];
    a.set(scratch.subarray(0, n));
  }
  for (let s = 0; s < n; s++) scratchCells[s] = cellOf[sorted[s]];
  cellOf.set(scratchCells.subarray(0, n));
  for (let s = 0; s < n; s++) sorted[s] = s;
}

function relax(n: number): number {
  let pairs = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    const c = cellOf[i];
    let density = 0;
    let near = 0;
    let found = 0;
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
    let mx = 0;
    let my = 0;
    pairs += found;
    for (let m = 0; m < found; m++) {
      const q = nbQ[m];
      const push = (pressure * q + pressureNear * q * q) * 0.5;
      const ux = nbX[m] * push;
      const uy = nbY[m] * push;
      const j = nbJ[m];
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

/** One simulation step: pour, integrate, relax, collide. */
export function tick(count: number, rocks: Rock[]): void {
  const n = Math.min(count, MAX_FLUID);
  setScale(scaleFor(n));
  const pour = Math.max(0, Math.min(n - state.live, Math.round(400 * state.k * state.k)));
  for (let p = 0; p < pour; p++) emit(state.live++);
  if (state.live > n) state.live = n;
  const live = state.live;
  for (let i = 0; i < live; i++) {
    vy[i] += GRAVITY;
    prevX[i] = x[i];
    prevY[i] = y[i];
    x[i] += vx[i];
    y[i] += vy[i];
  }
  buildGrid(live);
  state.pairs = relax(live);
  for (let i = 0; i < live; i++) {
    collide(i, rocks);
    vx[i] = (x[i] - prevX[i]) * 0.998;
    vy[i] = (y[i] - prevY[i]) * 0.998;
    if (x[i] > g.WORLD_W + 10 || y[i] > g.WORLD_H + 40) emit(i);
  }
}
