// River mode: water particles run down a meandering channel, speed up toward a lip, fall under
// gravity, burst into a pool and throw mist. Static rock and banks are particles too, so the whole
// scene is one sprites() call.
import type { Camera } from "./waves.ts";

const EYE = 13;
const MAX_WATER = 150_000;
const ROCK = 18_000;
const CAP = MAX_WATER + ROCK;
const GRAVITY = 9;
const TOP = -7; // where the river starts, upstream
const LIP = 0; // the edge of the falls
const HEIGHT = 2.6; // drop from the lip to the pool
const POOL = 4.5; // how far the pool runs past the falls

// River bed height and centre line, upstream of the lip.
const bed = (y: number): number => HEIGHT + (LIP - y) * 0.12;
const centre = (y: number): number => 0.7 * Math.sin(y * 0.55) * Math.min(1, (LIP - y) / 2);
const HALF_WIDTH = 0.65;

export const positions = new Float32Array(CAP * 2);
export const colors = new Uint32Array(CAP);
export const scales = new Float32Array(CAP);
export const timing = { sim: 0 };

// Water state. Phase 0: in the river, 1: falling, 2: in the pool, 3: mist.
const px = new Float32Array(MAX_WATER);
const py = new Float32Array(MAX_WATER);
const pz = new Float32Array(MAX_WATER);
const vx = new Float32Array(MAX_WATER);
const vy = new Float32Array(MAX_WATER);
const vz = new Float32Array(MAX_WATER);
const lane = new Float32Array(MAX_WATER); // -1 to 1 across the channel
const life = new Float32Array(MAX_WATER);
const phase = new Uint8Array(MAX_WATER);
let started = false;

function spawn(i: number, anywhere: boolean): void {
  lane[i] = Math.random() * 2 - 1;
  py[i] = anywhere ? TOP + Math.random() * (LIP - TOP) : TOP + Math.random() * 0.3;
  px[i] = centre(py[i]) + lane[i] * HALF_WIDTH;
  pz[i] = bed(py[i]);
  vx[i] = 0;
  vy[i] = 0;
  vz[i] = 0;
  phase[i] = 0;
  life[i] = 0;
}

// Rock and banks: fixed points, generated once.
const rock = new Float32Array(ROCK * 3);
{
  let k = 0;
  const put = (x: number, y: number, z: number): void => {
    if (k >= ROCK) return;
    rock[k * 3] = x;
    rock[k * 3 + 1] = y;
    rock[k * 3 + 2] = z;
    k++;
  };
  while (k < ROCK) {
    const r = Math.random();
    if (r < 0.45) {
      // Banks beside the channel, a little above the water.
      const y = TOP + Math.random() * (LIP - TOP);
      const side = Math.random() < 0.5 ? -1 : 1;
      const out = HALF_WIDTH + 0.05 + Math.random() * 1.6;
      put(centre(y) + side * out, y, bed(y) + 0.15 + out * 0.12 + Math.random() * 0.05);
    } else if (r < 0.75) {
      // The cliff face under the lip, wider than the falls.
      const x = (Math.random() * 2 - 1) * 2.6;
      put(x, LIP + Math.random() * 0.15, Math.random() * (bed(LIP) + 0.2));
    } else {
      // Ground around the pool.
      const a = Math.random() * Math.PI * 2;
      const r2 = 1.9 + Math.random() * 1.4;
      put(Math.cos(a) * r2 * 1.3, POOL / 2 + Math.sin(a) * r2 * 0.9, 0.05 + Math.random() * 0.1);
    }
  }
}

/** Simulates and projects everything; returns how many copies to draw. */
export function step(
  n: number,
  dt: number,
  now: number,
  W: number,
  H: number,
  dpr: number,
  camera: Camera,
  reducedMotion: boolean,
): number {
  const t0 = performance.now();
  const water = Math.min(n, MAX_WATER);
  if (!started) {
    for (let i = 0; i < MAX_WATER; i++) spawn(i, true);
    started = true;
  }
  const flow = reducedMotion ? 0.4 : 1;
  const sdt = dt * flow;
  const t = now / 1000;
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const unit = Math.min(W, H) * 0.11;
  let count = 0;

  for (let i = 0; i < water; i++) {
    let x = px[i];
    let y = py[i];
    let z = pz[i];
    const p = phase[i];
    let speed = 0;
    if (p === 0) {
      // In the river: faster in the middle of the channel and near the lip, with a little wobble.
      const near = Math.max(0, 1 - (LIP - y) / 3);
      const along = (1.2 + near * 2.2) * (1 - 0.35 * lane[i] * lane[i]);
      y += along * sdt;
      lane[i] = Math.max(-1, Math.min(1, lane[i] + Math.sin(t * 2 + i) * 0.15 * sdt));
      x = centre(y) + lane[i] * HALF_WIDTH * (1 - near * 0.2);
      z = bed(y) + 0.03 * Math.sin(y * 9 + lane[i] * 4 - t * 6);
      speed = along;
      if (y >= LIP) {
        phase[i] = 1;
        vx[i] = (centre(LIP + 0.01) - centre(LIP)) * 100 * along * 0.02;
        vy[i] = along;
        vz[i] = 0;
      }
    } else if (p === 1) {
      // Falling: ballistic, with a slight spread so the curtain frays as it drops.
      vz[i] -= GRAVITY * sdt;
      vx[i] += (Math.random() - 0.5) * 0.6 * sdt;
      x += vx[i] * sdt;
      y += vy[i] * sdt;
      z += vz[i] * sdt;
      speed = Math.hypot(vy[i], vz[i]);
      if (z <= 0) {
        // Hits the pool: bounce outward, and sometimes become mist.
        z = 0;
        if (Math.random() < 0.18) {
          phase[i] = 3;
          vx[i] = (Math.random() - 0.5) * 1.2;
          vy[i] = Math.random() * 0.8;
          vz[i] = 0.6 + Math.random() * 1.2;
          life[i] = 1.5 + Math.random() * 2;
        } else {
          phase[i] = 2;
          const a = Math.random() * Math.PI * 2;
          const s = 0.5 + Math.random() * 1.5;
          vx[i] = Math.cos(a) * s;
          vy[i] = Math.abs(Math.sin(a)) * s + 0.4;
          vz[i] = 0.5 + Math.random() * 1.5;
          life[i] = 2 + Math.random() * 2;
        }
      }
    } else if (p === 2) {
      // In the pool: a short hop, then drift away from the falls and slow down.
      vz[i] -= GRAVITY * sdt;
      x += vx[i] * sdt;
      y += vy[i] * sdt;
      z = Math.max(0, z + vz[i] * sdt);
      if (z === 0) {
        vz[i] = 0;
        vx[i] *= 1 - 1.5 * sdt;
        vy[i] = vy[i] * (1 - 1.2 * sdt) + 0.25 * sdt;
      }
      life[i] -= sdt;
      speed = Math.hypot(vx[i], vy[i]) * 0.6;
      if (life[i] <= 0 || y > POOL) {
        spawn(i, false);
        continue;
      }
    } else {
      // Mist: rises, drifts downstream, fades.
      vz[i] += (0.4 - vz[i]) * sdt;
      x += vx[i] * sdt;
      y += vy[i] * sdt;
      z += vz[i] * sdt;
      life[i] -= sdt;
      if (life[i] <= 0) {
        spawn(i, false);
        continue;
      }
    }
    px[i] = x;
    py[i] = y;
    pz[i] = z;

    count = project(count, x, y, z, cy, sy, cp, sp, unit, W, H, dpr, p === 3 ? 0.9 : 0.4);
    // Colour: deep blue when slow, white foam when fast; mist is faint white.
    let c: number;
    if (p === 3) c = 0xffffff00 | Math.round(Math.min(1, life[i] * 0.5) * 0x22);
    else {
      const foam = Math.min(1, speed / 6);
      const r = Math.round(0x1e + (0xff - 0x1e) * foam * foam);
      const g = Math.round(0x6f + (0xff - 0x6f) * foam);
      c = ((r << 24) | (g << 16) | (0xf0 << 8) | (0x40 + Math.round(foam * 0x60))) >>> 0;
    }
    colors[count - 1] = c;
  }

  for (let k = 0; k < ROCK; k++) {
    count = project(count, rock[k * 3], rock[k * 3 + 1], rock[k * 3 + 2], cy, sy, cp, sp, unit, W, H, dpr, 0.7);
    colors[count - 1] = 0x7d8c5aa0;
  }
  timing.sim += (performance.now() - t0 - timing.sim) * 0.05;
  return count;
}

function project(
  i: number,
  x: number,
  y: number,
  z: number,
  cy: number,
  sy: number,
  cp: number,
  sp: number,
  unit: number,
  W: number,
  H: number,
  dpr: number,
  size: number,
): number {
  // Centre the scene on the falls before turning it.
  const X = x;
  const Y = y + 1.2;
  const Z = z - 1.3;
  const rx = X * cy - Y * sy;
  const ry = X * sy + Y * cy;
  const up = Z * cp - ry * sp;
  const depth = ry * cp + Z * sp;
  const f = EYE / (EYE - depth);
  positions[i * 2] = W / 2 + rx * f * unit;
  positions[i * 2 + 1] = H / 2 - up * f * unit;
  scales[i] = size * f * dpr;
  return i + 1;
}

/** Water particles in each phase, for the stats line. */
export function census(n: number): string {
  const c = [0, 0, 0, 0];
  for (let i = 0; i < Math.min(n, MAX_WATER); i++) c[phase[i]]++;
  return `river ${c[0]}, falling ${c[1]}, pool ${c[2]}, mist ${c[3]}`;
}
