import { describe, expect, it } from "vitest";
import { earClip, ShapeBuffer } from "../src/shapes.js";

const I = [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number];

/** Area covered at full coverage: sum of triangles whose three vertices have coverage 1. */
function solidArea(b: ShapeBuffer): number {
  let area = 0;
  for (let t = 0; t < b.count; t += 3) {
    const v = (k: number) => [b.f32[(t + k) * 4] as number, b.f32[(t + k) * 4 + 1] as number, b.f32[(t + k) * 4 + 2] as number];
    const [a, c, d] = [v(0), v(1), v(2)] as number[][];
    if (a?.[2] !== 1 || c?.[2] !== 1 || d?.[2] !== 1) continue;
    area +=
      Math.abs(
        ((c[0] as number) - (a[0] as number)) * ((d[1] as number) - (a[1] as number)) -
          ((c[1] as number) - (a[1] as number)) * ((d[0] as number) - (a[0] as number)),
      ) / 2;
  }
  return area;
}

describe("earClip", () => {
  it("makes n - 2 triangles for a concave polygon, either winding", () => {
    // An L shape, area 3.
    const xs = [0, 2, 2, 1, 1, 0];
    const ys = [0, 0, 1, 1, 2, 2];
    let n = 0;
    earClip(xs, ys, 6, () => n++);
    expect(n).toBe(4);
  });
});

describe("ShapeBuffer", () => {
  it("fills a square with a half-pixel feather on each side, whichever way it winds", () => {
    for (const pts of [
      [0, 0, 10, 0, 10, 10, 0, 10],
      [0, 0, 0, 10, 10, 10, 10, 0],
    ]) {
      const b = new ShapeBuffer();
      b.add(I, pts, 4, true, 0, 0xffffffff, 1);
      // Core inset by half a pixel: 9 × 9.
      expect(solidArea(b)).toBeCloseTo(81, 5);
      // Two core triangles plus four fringe bands of two.
      expect(b.count).toBe(6 + 4 * 6);
    }
  });

  it("strokes a line with a core and two fringes per segment", () => {
    const b = new ShapeBuffer();
    b.add(I, [0, 0, 10, 0], 2, false, 4, 0xffffffff, 1);
    expect(b.count).toBe(18);
    expect(solidArea(b)).toBeCloseTo(30, 5); // 10 long, 4 - 1 wide
  });

  it("fades lines thinner than a pixel instead of thinning them", () => {
    const b = new ShapeBuffer();
    b.add(I, [0, 0, 10, 0], 2, false, 0.25, 0xffffffff, 1);
    let max = 0;
    for (let i = 0; i < b.count; i++) max = Math.max(max, b.f32[i * 4 + 2] as number);
    expect(max).toBeCloseTo(0.25, 5);
  });

  it("ignores repeated points and degenerate input", () => {
    const b = new ShapeBuffer();
    b.add(I, [0, 0, 0, 0, 5, 5, 5, 5], 4, true, 0, 0xffffffff, 1);
    b.add(I, [1, 1], 1, false, 2, 0xffffffff, 1);
    expect(b.count).toBe(0);
  });
});
