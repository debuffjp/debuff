import { describe, expect, it } from "vitest";
import { mulberry32, VirtualClock } from "../src/clock.js";
import { keyCodeFor, keyFor } from "../src/driver.js";

describe("VirtualClock", () => {
  it("runs queued frames only when advanced, with their timestamps", () => {
    const clock = new VirtualClock({ fps: 50 });
    const seen: number[] = [];
    const loop = (t: number) => {
      seen.push(t);
      clock.requestAnimationFrame(loop);
    };
    clock.requestAnimationFrame(loop);
    const cancelled = clock.requestAnimationFrame(() => seen.push(-1));
    clock.cancelAnimationFrame(cancelled);
    expect(seen).toEqual([]);
    clock.advance(3);
    expect(seen).toEqual([20, 40, 60]);
    expect([clock.tick, clock.ms]).toEqual([3, 60]);
  });

  it("seeds randomness reproducibly", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a()]).toEqual([b(), b()]);
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("installs and restores time and randomness", () => {
    const clock = new VirtualClock({ seed: 9, epoch: 1000 });
    const random = Math.random;
    clock.install();
    clock.install();
    clock.advance(6);
    expect(performance.now()).toBeCloseTo(100);
    expect(Date.now()).toBe(1100);
    expect(Math.random()).toBe(mulberry32(9)());
    clock.uninstall();
    expect(Math.random).toBe(random);
    expect(Date.now()).toBeGreaterThan(1100);
  });
});

describe("keyFor", () => {
  it("maps KeyboardEvent.code to the key a US layout produces", () => {
    expect(["KeyA", "Digit7", "Numpad3", "Space", "ShiftLeft", "Slash", "ArrowLeft", "Enter"].map(keyFor)).toEqual([
      "a",
      "7",
      "3",
      " ",
      "Shift",
      "/",
      "ArrowLeft",
      "Enter",
    ]);
  });
});

describe("keyCodeFor", () => {
  it("gives the legacy keyCode older engines read", () => {
    expect(["KeyA", "Digit0", "Numpad5", "F12", "ArrowRight", "Space", "Quote", "Mystery"].map(keyCodeFor)).toEqual([
      65, 48, 101, 123, 39, 32, 222, 0,
    ]);
  });
});
