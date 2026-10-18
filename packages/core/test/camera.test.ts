import { describe, expect, it } from "vitest";
import { approach, Camera, damp, overlaps, Random } from "../src/index.js";

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

describe("Camera interpolation", () => {
  it("draws between the previous and current step by renderAlpha", () => {
    const cam = new Camera({ width: 100, height: 100 });
    cam.lerp = 0;
    const target = { x: 50, y: 50 };
    cam.follow(target);
    expect(cam.view()[4]).toBe(0);
    target.x = 60;
    cam.update(1 / 60, new Random(1));
    cam.renderAlpha = 0.5;
    expect(cam.view()[4]).toBe(-5);
    cam.renderAlpha = 1;
    expect(cam.view()[4]).toBe(-10);
  });
});

describe("Camera pixel snapping", () => {
  it("keeps a smoothly followed sprite on one pixel instead of shimmying", () => {
    // A target moving at a steady speed, followed with the default smoothing: once the lag settles,
    // the target's snapped screen position must stay put (it used to flip between two pixels).
    const cam = new Camera({ width: 320, height: 180 });
    const target = { x: 0, y: 0 };
    cam.follow(target);
    const r = new Random(1);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      target.x += 37.3 / 60;
      cam.update(1 / 60, r);
      const m = cam.view();
      if (i > 300) seen.add(Math.round(m[0] * target.x + m[4]));
    }
    expect(seen.size).toBe(1);
  });
});
