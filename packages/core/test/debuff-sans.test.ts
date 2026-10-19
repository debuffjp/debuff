import { describe, expect, it } from "vitest";
import { Canvas2DBackend } from "../../spryte/src/canvas2d.js";
import { Draw } from "../../spryte/src/draw.js";
import { debuffSans } from "../src/render/debuff-sans.js";
import { DEBUFF_SANS, DEBUFF_SANS_EXTRAS } from "../src/render/debuff-sans-data.js";

describe("debuff sans", () => {
  it("covers printable ASCII with proportional widths", () => {
    expect(DEBUFF_SANS.length).toBe((95 + [...DEBUFF_SANS_EXTRAS].length) * 10);
    const font = debuffSans();
    expect(font.height).toBe(9);
    expect(font.glyph("A")?.advance).toBe(5);
    expect(font.glyph("i")?.advance).toBe(1);
    expect(font.glyph(" ")?.advance).toBe(3);
    // Unknown characters fall back to "?".
    expect(font.glyph("é")).toBe(font.glyph("?"));
    expect(font.glyph("·")?.advance).toBe(1);
    expect(font.glyph("♥")?.advance).toBe(5);
    expect(font.measure("LV 1")).toEqual({ w: 5 + 1 + 5 + 1 + 3 + 1 + 3, h: 9 });
    expect(debuffSans()).toBe(font);
  });

  it("is draw.text's default font", () => {
    const calls: string[] = [];
    const ctx: Record<string, unknown> = {
      globalAlpha: 1,
      fillStyle: "",
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
    };
    for (const name of ["setTransform", "fillRect", "drawImage", "clearRect", "save", "restore", "beginPath", "rect", "clip"])
      ctx[name] = () => calls.push(name);
    const draw = new Draw(new Canvas2DBackend(ctx as unknown as CanvasRenderingContext2D), false);
    draw.font = debuffSans; // what Game does
    expect(draw.measure("hi")).toEqual(debuffSans().measure("hi"));
    draw.text("hi", 0, 0);
    expect(calls.filter((c) => c === "drawImage")).toHaveLength(2); // one quad per glyph, no CSS raster
  });
});
