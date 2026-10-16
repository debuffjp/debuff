import { describe, expect, it } from "vitest";
import { Camera, Random, approach, damp, overlaps } from "../src/index.js";

describe("Camera", () => {
  it("snaps to target and clamps to bounds", () => {
    const cam = new Camera({ width: 100, height: 100, bounds: { x: 0, y: 0, width: 400, height: 400 } });
    cam.follow({ x: 10, y: 390 });
    expect(cam.x).toBe(50);
    expect(cam.y).toBe(350);
  });

  it("converges toward a moving target", () => {
    const cam = new Camera({ width: 100, height: 100 });
    const target = { x: 0, y: 0 };
    cam.follow(target);
    target.x = 100;
    const r = new Random(1);
    for (let i = 0; i < 120; i++) cam.update(1 / 60, r);
    expect(cam.x).toBeCloseTo(100, 0);
  });

  it("culls off-screen rects and maps screen to world", () => {
    const cam = new Camera({ width: 100, height: 100 });
    expect(cam.sees(0, 0, 10, 10)).toBe(true);
    expect(cam.sees(200, 0, 10, 10)).toBe(false);
    expect(cam.toWorld(50, 50)).toEqual({ x: 0, y: 0 });
  });
});

describe("math", () => {
  it("approach, damp, overlaps", () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(damp(0, 10, 1000, 1)).toBeCloseTo(10);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });
});
