import { describe, expect, it, vi } from "vitest";
import { Trail } from "../src/index.js";

describe("Trail", () => {
  it("keeps the most recent points and draws fading segments", () => {
    const trail = new Trail(3);
    for (let i = 0; i < 5; i++) trail.push(i, i);
    const ctx = { globalAlpha: 1, beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() };
    trail.draw(ctx as unknown as CanvasRenderingContext2D);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 2, 2);
    expect(ctx.globalAlpha).toBe(1);
    trail.clear();
    trail.draw(ctx as unknown as CanvasRenderingContext2D);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });
});
