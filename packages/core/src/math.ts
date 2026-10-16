export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential approach: `damp(current, target, 10, dt)`. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

/** Move `current` toward `target` by at most `maxDelta`. */
export const approach = (current: number, target: number, maxDelta: number): number =>
  current < target ? Math.min(current + maxDelta, target) : Math.max(current - maxDelta, target);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const circlesOverlap = (ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean => {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
};
