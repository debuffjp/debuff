// A million-boid flock, simulated on the CPU in plain JavaScript over typed arrays. Real boids look at their
// neighbours; at a million that's too slow, so this flock averages instead: each step bins the boids into a
// coarse grid, and every boid steers toward its cell's average heading (alignment) and away from crowding,
// down the density gradient between cells (separation). A slowly drifting swirl field and a wandering
// attractor give the flock its shape.
//
// The step is three kernels over shared typed arrays, so workers can split the boids between them: `bin`
// (each worker sums its range into its own slot), `reduce` (merge the slots into per-cell averages, on one
// thread: there are only a few thousand cells) and `move` (steer, move and colour a range).

export const CELL = 24; // grid cell in px: the "neighbourhood" a boid averages over
const ALI = 2.2;
const SEP = 0.5; // push down the density gradient, per boid of difference between cells
const SWIRL = 95;
const PULL = 0.12;
const MIN_SPEED = 55;
const MAX_SPEED = 150;
const FEAR = 140;
/** Floats per cell in a partial-sum slot: count, vx, vy, x, y. */
const PART = 5;
/** Floats per cell in the averages: vx, vy, x, y, swirl x, swirl y, count. */
const AVG = 7;

/** The flock's memory. Every array can sit on a SharedArrayBuffer, so workers see the same flock. */
export interface Buffers {
  /** x, y per boid, ready for `draw.sprites`. */
  pos: Float32Array;
  vel: Float32Array;
  /** 0xRRGGBBAA per boid, coloured by heading. */
  colors: Uint32Array;
  /** The cell each boid was binned into this step. */
  cell: Int32Array;
  /** One slot of per-cell partial sums per worker. */
  partial: Float32Array;
  avg: Float32Array;
}

/** What one step needs to know, the same for every worker. */
export interface StepParams {
  n: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  dt: number;
  t: number;
  /** Predator position, or NaN for none. */
  scareX: number;
  scareY: number;
  /**
   * Where the grid starts this step, in [0, CELL). A new random offset each step keeps the boids from
   * lining up on cell boundaries: with a fixed grid, cohesion pulls them into a visible lattice.
   */
  gridX: number;
  gridY: number;
}

export function gridSize(width: number, height: number): { cols: number; rows: number } {
  // One extra column and row: the grid shifts by up to a cell each step.
  return { cols: Math.max(1, Math.ceil(width / CELL) + 1), rows: Math.max(1, Math.ceil(height / CELL) + 1) };
}

/** Allocate a flock of `capacity` boids for `slots` workers, on shared memory when `shared` is true. */
export function allocate(capacity: number, cells: number, slots: number, shared: boolean): Buffers {
  const make = (bytes: number) => (shared ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes));
  return {
    pos: new Float32Array(make(capacity * 8)),
    vel: new Float32Array(make(capacity * 8)),
    colors: new Uint32Array(make(capacity * 4)),
    cell: new Int32Array(make(capacity * 4)),
    partial: new Float32Array(make(slots * cells * PART * 4)),
    avg: new Float32Array(make(cells * AVG * 4)),
  };
}

/** A seeded generator, so every run (and the recorded clip) starts from the same flock. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Start the flock as a loose ring, so the first second already looks like a flock. */
export function seed(b: Buffers, n: number, width: number, height: number, s = 1): void {
  const rand = mulberry32(s);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const r = (0.15 + rand() * 0.3) * Math.min(width, height);
    b.pos[i * 2] = width / 2 + Math.cos(a) * r;
    b.pos[i * 2 + 1] = height / 2 + Math.sin(a) * r;
    b.vel[i * 2] = -Math.sin(a) * 90;
    b.vel[i * 2 + 1] = Math.cos(a) * 90;
  }
}

/** Sum boids `start..end` into partial slot `slot`, and remember each boid's cell. */
export function bin(b: Buffers, p: StepParams, start: number, end: number, slot: number): void {
  const cells = p.cols * p.rows;
  const base = slot * cells * PART;
  const part = b.partial;
  part.fill(0, base, base + cells * PART);
  const { pos, vel, cell } = b;
  const inv = 1 / CELL;
  const maxCol = p.cols - 1;
  const maxRow = p.rows - 1;
  const cols = p.cols;
  const gx = p.gridX;
  const gy = p.gridY;
  for (let i = start; i < end; i++) {
    const x = pos[2 * i] as number;
    const y = pos[2 * i + 1] as number;
    let cx = ((x + gx) * inv) | 0;
    let cy = ((y + gy) * inv) | 0;
    if (cx < 0) cx = 0;
    else if (cx > maxCol) cx = maxCol;
    if (cy < 0) cy = 0;
    else if (cy > maxRow) cy = maxRow;
    const c = cy * cols + cx;
    cell[i] = c;
    const s = base + c * PART;
    part[s] = (part[s] as number) + 1;
    part[s + 1] = (part[s + 1] as number) + (vel[2 * i] as number);
    part[s + 2] = (part[s + 2] as number) + (vel[2 * i + 1] as number);
    part[s + 3] = (part[s + 3] as number) + x;
    part[s + 4] = (part[s + 4] as number) + y;
  }
}

/** Merge `slots` partial slots into per-cell averages, and sample the swirl field once per cell. */
export function reduce(b: Buffers, p: StepParams, slots: number): void {
  const cells = p.cols * p.rows;
  const { partial, avg } = b;
  for (let c = 0; c < cells; c++) {
    let k = 0;
    let vx = 0;
    let vy = 0;
    let x = 0;
    let y = 0;
    for (let w = 0; w < slots; w++) {
      const s = (w * cells + c) * PART;
      k += partial[s] as number;
      vx += partial[s + 1] as number;
      vy += partial[s + 2] as number;
      x += partial[s + 3] as number;
      y += partial[s + 4] as number;
    }
    const a = c * AVG;
    const r = k > 0 ? 1 / k : 0;
    avg[a] = vx * r;
    avg[a + 1] = vy * r;
    avg[a + 2] = x * r;
    avg[a + 3] = y * r;
    // The swirl barely changes across one cell, so it's sampled at the cell's centre.
    const ccx = ((c % p.cols) + 0.5) * CELL - p.gridX;
    const ccy = (((c / p.cols) | 0) + 0.5) * CELL - p.gridY;
    avg[a + 4] = Math.sin(ccy * 0.0045 + p.t * 0.6) * SWIRL;
    avg[a + 5] = Math.cos(ccx * 0.0052 - p.t * 0.45) * SWIRL;
    avg[a + 6] = k;
  }
}

// Heading to colour: 64 steps through debuff's accent colours.
const WHEEL = new Uint32Array(64);
{
  const stops = [0xcffb2d, 0x38bdf8, 0xa78bfa, 0xf472b6, 0xfbbf24, 0xcffb2d];
  for (let k = 0; k < 64; k++) {
    const t = (k / 64) * (stops.length - 1);
    const a = stops[Math.floor(t)] as number;
    const b = stops[Math.floor(t) + 1] as number;
    const f = t - Math.floor(t);
    const mix = (s: number): number => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f);
    WHEEL[k] = ((mix(16) << 24) | (mix(8) << 16) | (mix(0) << 8) | 0xd0) >>> 0;
  }
}

/** Steer, move, wrap and colour boids `start..end`, from the cell they were binned into. */
export function move(b: Buffers, p: StepParams, start: number, end: number): void {
  const { pos, vel, colors, cell, avg } = b;
  const { dt, width: w, height: h } = p;
  const axp = w * (0.5 + 0.32 * Math.sin(p.t * 0.21));
  const ayp = h * (0.5 + 0.3 * Math.sin(p.t * 0.33 + 1.3));
  const scared = !Number.isNaN(p.scareX);
  const fear2 = FEAR * FEAR;
  const inv = 1 / CELL;
  const cols = p.cols;
  // The gradient reads one cell right and one down, so they stop one short of the last column and row.
  const maxCol = p.cols - 2;
  const maxRow = p.rows - 2;
  const gx = p.gridX;
  const gy = p.gridY;
  for (let i = start; i < end; i++) {
    const xi = 2 * i;
    let x = pos[xi] as number;
    let y = pos[xi + 1] as number;
    let vx = vel[xi] as number;
    let vy = vel[xi + 1] as number;
    const a = (cell[i] as number) * AVG;
    let ax = ((avg[a] as number) - vx) * ALI + (avg[a + 4] as number) + (axp - x) * PULL;
    let ay = ((avg[a + 1] as number) - vy) * ALI + (avg[a + 5] as number) + (ayp - y) * PULL;
    // Separation: down the density gradient, blended from the four nearest cell centres. Pushing toward or
    // away from each cell's own centre instead snaps boids into a cell-sized lattice.
    const fx = (x + gx) * inv - 0.5;
    const fy = (y + gy) * inv - 0.5;
    let i0 = fx | 0;
    let j0 = fy | 0;
    if (i0 < 0) i0 = 0;
    else if (i0 > maxCol) i0 = maxCol;
    if (j0 < 0) j0 = 0;
    else if (j0 > maxRow) j0 = maxRow;
    const tx = fx - i0;
    const ty = fy - j0;
    const c00 = (j0 * cols + i0) * AVG + 6;
    const k00 = avg[c00] as number;
    const k10 = avg[c00 + AVG] as number;
    const k01 = avg[c00 + cols * AVG] as number;
    const k11 = avg[c00 + (cols + 1) * AVG] as number;
    const dkx = (k10 - k00) * (1 - ty) + (k11 - k01) * ty;
    const dky = (k01 - k00) * (1 - tx) + (k11 - k10) * tx;
    ax -= dkx * SEP;
    ay -= dky * SEP;
    if (scared) {
      const dx = x - p.scareX;
      const dy = y - p.scareY;
      const d2 = dx * dx + dy * dy;
      if (d2 < fear2) {
        const f = (1 - d2 / fear2) * 24;
        ax += dx * f;
        ay += dy * f;
      }
    }
    vx += ax * dt;
    vy += ay * dt;
    const sp = Math.sqrt(vx * vx + vy * vy) || 1;
    const sc = (sp < MIN_SPEED ? MIN_SPEED : sp > MAX_SPEED ? MAX_SPEED : sp) / sp;
    vx *= sc;
    vy *= sc;
    x += vx * dt;
    y += vy * dt;
    if (x < 0) x += w;
    else if (x >= w) x -= w;
    if (y < 0) y += h;
    else if (y >= h) y -= h;
    pos[xi] = x;
    pos[xi + 1] = y;
    vel[xi] = vx;
    vel[xi + 1] = vy;
    // Heading without atan2: the "diamond angle" in [0, 4), 16 colour steps per quarter turn.
    let d: number;
    if (vy >= 0) d = vx >= 0 ? vy / (vx + vy) : 1 - vx / (-vx + vy);
    else d = vx < 0 ? 2 - vy / (-vx - vy) : 3 + vx / (vx - vy);
    colors[i] = WHEEL[((d * 16) | 0) & 63] as number;
  }
}

/** One step on this thread: the fallback when workers can't share memory. */
export function stepHere(b: Buffers, p: StepParams): void {
  bin(b, p, 0, p.n, 0);
  reduce(b, p, 1);
  move(b, p, 0, p.n);
}
