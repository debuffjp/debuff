import { describe, expect, it, vi } from "vitest";
import { type DrawLike, Particles, Trail } from "../src/index.js";

const mockDraw = () => ({ alpha: 1, rect: vi.fn(), circle: vi.fn(), line: vi.fn(), blend: vi.fn() }) satisfies DrawLike;

describe("Trail", () => {
  it("keeps the most recent points and draws fading segments", () => {
    const trail = new Trail(3, "#fff", 4);
    for (let i = 0; i < 5; i++) trail.push(i, i);
    const draw = mockDraw();
    trail.draw(draw);
    expect(draw.line).toHaveBeenCalledTimes(2);
    expect(draw.line).toHaveBeenNthCalledWith(1, 2, 2, 3, 3, 2, "#fff");
    expect(draw.alpha).toBe(1);
    trail.clear();
    trail.draw(draw);
    expect(draw.line).toHaveBeenCalledTimes(2);
  });
});

describe("Particles.draw", () => {
  it("draws shapes and groups additive blending", () => {
    const p = new Particles(() => 0.5);
    p.emit({ x: 0, y: 0, count: 2, shape: "circle", additive: true });
    p.emit({ x: 0, y: 0, count: 1 });
    const draw = mockDraw();
    p.draw(draw);
    expect(draw.circle).toHaveBeenCalledTimes(2);
    expect(draw.rect).toHaveBeenCalledTimes(1);
    expect(draw.blend.mock.calls).toEqual([["add"], ["normal"]]);
    expect(draw.alpha).toBe(1);
  });
});
