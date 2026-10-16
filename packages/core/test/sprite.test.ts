import { describe, expect, it } from "vitest";
import { type Frame, originOffset, Sprite, sliceGrid } from "../src/index.js";

const image = { width: 64, height: 32 } as unknown as HTMLImageElement;
const frames: Frame[] = sliceGrid(image, 16, 16);

describe("sliceGrid", () => {
  it("slices row-major", () => {
    expect(frames).toHaveLength(8);
    expect(frames[5]).toMatchObject({ x: 16, y: 16, w: 16, h: 16 });
  });
});

describe("Sprite animations", () => {
  const make = () =>
    new Sprite({
      frames,
      animations: { run: { frames: [0, 1, 2, 3], fps: 10 }, hit: { frames: [4, 5], fps: 10, loop: false } },
    });

  it("advances and loops", () => {
    const s = make();
    s.play("run");
    s.update(0.25);
    expect(s.frame).toBe(2);
    s.update(0.2);
    expect(s.frame).toBe(0);
  });

  it("holds the last frame of one-shot clips and reports done", () => {
    const s = make();
    s.play("hit");
    s.update(1);
    expect(s.frame).toBe(5);
    expect(s.done).toBe(true);
  });

  it("does not restart the current clip unless asked", () => {
    const s = make();
    s.play("run");
    s.update(0.15);
    s.play("run");
    expect(s.frame).toBe(1);
    s.play("run", true);
    expect(s.frame).toBe(0);
  });

  it("names known clips when an unknown one is requested", () => {
    expect(() => make().play("jump")).toThrow(/Known: run, hit/);
  });

  it("computes origin offsets", () => {
    expect(originOffset("center", 16, 8)).toEqual([8, 4]);
    expect(originOffset("bottom-center", 16, 8)).toEqual([8, 8]);
    expect(originOffset([0.25, 1], 16, 8)).toEqual([4, 8]);
  });
});
