/**
 * Accessibility screening for scenarios: photosensitive flashing (an approximation of WCAG 2.3.1's general
 * flash threshold) and contrast. These are screening checks on what the game actually draws, not a
 * certification; a pass means "nothing obviously unsafe in this run", not "safe".
 */

/** Grid the frame is sampled on for the flash check. */
export const FLASH_GRID = 24;

/** A change of this much relative luminance (of 1.0 max) counts, when the darker side is below `DARK`. */
const DELTA = 0.1;
const DARK = 0.8;
/** More than three flashes (six opposing changes) in any one second fails. */
const MAX_FLASHES_PER_SECOND = 3;
/** The flashing area that fails: a quarter of the "10° of vision" field. */
const AREA = 0.25;

export interface FlashReport {
  safe: boolean;
  /** Most flashes any one spot made in a one-second window. */
  maxFlashesPerSecond: number;
  /** Largest share of a 10° field that flashed more than three times a second together (0–1). */
  worstArea: number;
  /** Step (from the start of the check) where the worst area was reached. */
  atStep: number;
}

/**
 * Times (steps) of the opposing luminance changes in one cell's series: a change of at least `DELTA` with the
 * darker value below `DARK`, each reversing the direction of the previous one. Two make a flash.
 */
export function transitions(series: number[]): number[] {
  const out: number[] = [];
  const counts = (a: number, b: number) => Math.abs(a - b) >= DELTA && Math.min(a, b) < DARK;
  // Until the first change, watch both ways from the extremes seen so far.
  let low = series[0] ?? 0;
  let high = low;
  let dir = 0;
  let peak = low;
  for (let t = 1; t < series.length; t++) {
    const v = series[t] ?? 0;
    if (dir === 0) {
      if (counts(v, low) && v > low) [dir, peak] = [1, v];
      else if (counts(v, high) && v < high) [dir, peak] = [-1, v];
      else {
        low = Math.min(low, v);
        high = Math.max(high, v);
        continue;
      }
      out.push(t);
      continue;
    }
    if ((dir === 1 && v > peak) || (dir === -1 && v < peak)) peak = v;
    else if (counts(v, peak)) {
      out.push(t);
      dir = -dir;
      peak = v;
    }
  }
  return out;
}

/**
 * Screen sampled luminance frames (`frames[step][row * cols + col]`) for general flashes. The "10° of vision"
 * field is taken as a third of the screen each way (a full-screen game at a normal viewing distance).
 */
export function analyzeFlashes(frames: number[][], cols: number, rows: number, stepsPerSecond: number): FlashReport {
  const steps = frames.length;
  const cells = cols * rows;
  const window = Math.max(1, Math.round(stepsPerSecond));
  // Per cell: how many opposing changes fall in the one-second window ending at each step.
  const inWindow: Uint16Array[] = [];
  let maxTransitions = 0;
  for (let c = 0; c < cells; c++) {
    const times = transitions(frames.map((f) => f[c] ?? 0));
    const counts = new Uint16Array(steps);
    let lo = 0;
    for (let hi = 0, t = 0; t < steps; t++) {
      while (hi < times.length && (times[hi] ?? 0) <= t) hi++;
      while (lo < hi && (times[lo] ?? 0) <= t - window) lo++;
      counts[t] = hi - lo;
      if (hi - lo > maxTransitions) maxTransitions = hi - lo;
    }
    inWindow.push(counts);
  }
  const limit = MAX_FLASHES_PER_SECOND * 2;
  const bw = Math.max(1, Math.ceil(cols / 3));
  const bh = Math.max(1, Math.ceil(rows / 3));
  let worstArea = 0;
  let atStep = 0;
  const flashing = new Uint8Array(cells);
  const sum = new Uint32Array((cols + 1) * (rows + 1));
  for (let t = 0; t < steps; t++) {
    let any = false;
    for (let c = 0; c < cells; c++) {
      flashing[c] = (inWindow[c]?.[t] ?? 0) > limit ? 1 : 0;
      any ||= flashing[c] === 1;
    }
    if (!any) continue;
    // 2D prefix sums, then every bw × bh block of the grid.
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        sum[(r + 1) * (cols + 1) + c + 1] =
          (flashing[r * cols + c] ?? 0) +
          (sum[r * (cols + 1) + c + 1] ?? 0) +
          (sum[(r + 1) * (cols + 1) + c] ?? 0) -
          (sum[r * (cols + 1) + c] ?? 0);
    for (let r = 0; r + bh <= rows; r++)
      for (let c = 0; c + bw <= cols; c++) {
        const n =
          (sum[(r + bh) * (cols + 1) + c + bw] ?? 0) -
          (sum[r * (cols + 1) + c + bw] ?? 0) -
          (sum[(r + bh) * (cols + 1) + c] ?? 0) +
          (sum[r * (cols + 1) + c] ?? 0);
        const area = n / (bw * bh);
        if (area > worstArea) {
          worstArea = area;
          atStep = t;
        }
      }
  }
  return { safe: worstArea < AREA, maxFlashesPerSecond: maxTransitions / 2, worstArea, atStep };
}

/**
 * WCAG contrast ratio between the light and dark parts of a sampled region: the 95th and 5th percentile
 * luminance, so a few stray pixels don't decide it. 1 is no contrast, 21 is black on white.
 */
export function contrastRatio(luminance: number[]): number {
  if (!luminance.length) return 1;
  const sorted = [...luminance].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return (at(0.95) + 0.05) / (at(0.05) + 0.05);
}
