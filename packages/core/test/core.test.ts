import { describe, expect, it } from "vitest";
import { FixedClock, ParamRegistry, Random } from "../src/index.js";

describe("FixedClock", () => {
  it("steps in fixed increments and carries the remainder", () => {
    const clock = new FixedClock({ step: 0.1 });
    let steps = 0;
    const alpha = clock.advance(0.25, () => steps++);
    expect(steps).toBe(2);
    expect(alpha).toBeCloseTo(0.5);
    clock.advance(0.05, () => steps++);
    expect(steps).toBe(3);
    expect(clock.tick).toBe(3);
  });

  it("caps a single large frame", () => {
    const clock = new FixedClock({ step: 0.1, maxFrame: 0.3 });
    let steps = 0;
    clock.advance(10, () => steps++);
    expect(steps).toBe(3);
  });
});

describe("Random", () => {
  it("is reproducible for a given seed", () => {
    const a = new Random(42);
    const b = new Random(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(seqA.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it("int is inclusive", () => {
    const r = new Random(7);
    const seen = new Set(Array.from({ length: 200 }, () => r.int(1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });
});

describe("ParamRegistry", () => {
  const make = () => {
    const reg = new ParamRegistry();
    const player = reg.define("player", {
      speed: { type: "number", default: 200, min: 0, max: 1000, units: "px/s" },
      doubleJump: { type: "boolean", default: false },
    });
    return { reg, player };
  };

  it("exposes defaults and a serialisable description", () => {
    const { reg, player } = make();
    expect(player.values.speed).toBe(200);
    expect(JSON.parse(JSON.stringify(reg.describe())).player.values).toEqual({ speed: 200, doubleJump: false });
  });

  it("validates range and type, and emits changes", () => {
    const { reg, player } = make();
    const changes: unknown[] = [];
    reg.onChange((c) => changes.push(c));
    player.set("speed", 300);
    expect(changes).toEqual([{ group: "player", key: "speed", previous: 200, value: 300 }]);
    expect(() => player.set("speed", 5000)).toThrow(RangeError);
    expect(() => player.set("speed", true)).toThrow(TypeError);
    player.reset();
    expect(player.get("speed")).toBe(200);
  });
});
