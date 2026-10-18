import { describe, expect, it } from "vitest";
import { analyzeFlashes, contrastRatio, transitions } from "../src/scenario/a11y.js";

/** `steps` frames of a cols × rows grid where `flash(step, col, row)` gives each cell's luminance. */
const frames = (steps: number, cols: number, rows: number, at: (t: number, c: number, r: number) => number) =>
  Array.from({ length: steps }, (_, t) => Array.from({ length: cols * rows }, (_, i) => at(t, i % cols, Math.floor(i / cols))));

describe("transitions", () => {
  it("counts opposing changes of 10% or more where the darker side is below 0.8", () => {
    expect(transitions([0, 0.5, 0, 0.5, 0])).toEqual([1, 2, 3, 4]);
    expect(transitions([0, 0.05, 0, 0.05])).toEqual([]); // too small
    expect(transitions([0.85, 1, 0.85, 1])).toEqual([]); // both sides too bright
    expect(transitions([0, 0.2, 0.4, 0.6, 0.1])).toEqual([1, 4]); // a slow rise is one change
  });
});

describe("analyzeFlashes", () => {
  it("fails a full-screen flash at 10 Hz and passes one at 2 Hz", () => {
    const fast = analyzeFlashes(
      frames(120, 24, 24, (t) => (Math.floor(t / 3) % 2 ? 1 : 0)),
      24,
      24,
      60,
    );
    expect(fast.safe).toBe(false);
    expect(fast.maxFlashesPerSecond).toBeGreaterThan(3);
    expect(fast.worstArea).toBe(1);
    const slow = analyzeFlashes(
      frames(120, 24, 24, (t) => (Math.floor(t / 15) % 2 ? 1 : 0)),
      24,
      24,
      60,
    );
    expect(slow.safe).toBe(true);
    expect(slow.maxFlashesPerSecond).toBeLessThanOrEqual(3);
  });

  it("passes a small flashing spot but fails one covering a quarter of a field", () => {
    const strobe = (t: number) => (Math.floor(t / 3) % 2 ? 1 : 0);
    const spot = analyzeFlashes(
      frames(120, 24, 24, (t, c, r) => (c < 2 && r < 2 ? strobe(t) : 0.2)),
      24,
      24,
      60,
    );
    expect(spot.safe).toBe(true);
    const patch = analyzeFlashes(
      frames(120, 24, 24, (t, c, r) => (c < 5 && r < 5 ? strobe(t) : 0.2)),
      24,
      24,
      60,
    );
    expect(patch.safe).toBe(false);
    expect(patch.worstArea).toBeCloseTo(25 / 64);
  });
});

describe("contrastRatio", () => {
  it("is the WCAG ratio between the light and dark parts", () => {
    expect(contrastRatio([0, 0, 1, 1])).toBeCloseTo(21);
    expect(contrastRatio([0.2, 0.2, 0.2])).toBe(1);
    expect(contrastRatio([])).toBe(1);
  });
});
