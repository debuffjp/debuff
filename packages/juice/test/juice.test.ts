import { describe, expect, it } from "vitest";
import { Particles, Tweens, ease, squash } from "../src/index.js";

describe("Tweens", () => {
  it("interpolates and completes", async () => {
    const tweens = new Tweens();
    const o = { x: 0 };
    const t = tweens.to(o, { x: 10 }, { duration: 1, ease: "linear" });
    tweens.update(0.5);
    expect(o.x).toBeCloseTo(5);
    tweens.update(0.6);
    expect(o.x).toBe(10);
    expect(t.done).toBe(true);
    await t.finished;
    expect(tweens.count).toBe(0);
  });

  it("respects delay and yoyo", () => {
    const tweens = new Tweens();
    const o = { x: 0 };
    tweens.to(o, { x: 10 }, { duration: 1, ease: "linear", delay: 0.5, yoyo: true });
    tweens.update(0.5);
    expect(o.x).toBe(0);
    tweens.update(1);
    expect(o.x).toBeCloseTo(10);
    tweens.update(1);
    expect(o.x).toBeCloseTo(0);
  });

  it("squash springs back to 1", () => {
    const tweens = new Tweens();
    const s = { scaleX: 1, scaleY: 1 };
    squash(tweens, s, 0.4);
    expect(s.scaleX).toBeCloseTo(1.4);
    tweens.update(1);
    expect(s.scaleX).toBe(1);
  });
});

describe("ease", () => {
  it("all curves map 0→0 and 1→1", () => {
    for (const [name, fn] of Object.entries(ease)) {
      expect(fn(0), name).toBeCloseTo(0);
      expect(fn(1), name).toBeCloseTo(1);
    }
  });
});

describe("Particles", () => {
  it("emits, expires and reuses", () => {
    const p = new Particles(() => 0.5, 5);
    p.emit({ x: 0, y: 0, count: 10, life: [1, 1] });
    expect(p.count).toBe(5);
    p.update(0.5);
    expect(p.count).toBe(5);
    p.update(0.6);
    expect(p.count).toBe(0);
  });
});
