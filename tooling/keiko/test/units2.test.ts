import { describe, expect, it } from "vitest";
import { mulberry32, realSetTimeout, VirtualClock } from "../src/clock.js";
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

  it("fires timers in due order, each at its own time, interleaved with frames", () => {
    const clock = new VirtualClock({ fps: 10 });
    const log: string[] = [];
    clock.install();
    try {
      setTimeout(() => log.push(`b@${performance.now()}`), 150);
      setTimeout(() => log.push(`a@${performance.now()}`), 50);
      const id = setInterval(() => log.push(`i@${performance.now()}`), 120);
      clock.requestAnimationFrame((t) => log.push(`frame@${t}`));
      clock.advance(1);
      expect(log).toEqual(["a@50", "frame@100"]);
      clock.advance(2);
      expect(log).toEqual(["a@50", "frame@100", "i@120", "b@150", "i@240"]);
      clearInterval(id);
      clock.advanceTime(1000);
      expect(log).toHaveLength(5);
      expect(clock.pending).toEqual({ timers: 0, frames: 0 });
      setTimeout(() => log.push("zero"));
      clock.advanceTime(0);
      expect(log.at(-1)).toBe("zero");
    } finally {
      clock.uninstall();
    }
    expect(typeof setTimeout(() => {}, 0)).not.toBe("number");
  });

  it("clamps self-rescheduling zero-delay timers like a browser, and refuses string handlers", () => {
    const clock = new VirtualClock();
    let runs = 0;
    const again = () => {
      runs++;
      clock.setTimeout(again, 0);
    };
    clock.setTimeout(again, 0);
    clock.advance(1);
    expect(runs).toBe(5); // at 0, 4, 8, 12 and 16 ms of a 16.7 ms frame
    clock.uninstall();
    clock.setTimeout("alert(1)" as unknown as () => void, 0);
    expect(() => clock.advance(1)).toThrow(/don't evaluate strings/);
  });

  it("gives the dev server's bundlers real timers, so a game's first import can't deadlock on them", async () => {
    // Vite's dependency optimizer debounces on setTimeout while the game's import waits for it. If that timer
    // were virtual it would never fire, because the clock doesn't move until the import finishes.
    const from = (path: string) =>
      new Function("fire", `return setTimeout(fire, 1);\n//# sourceURL=${path}`) as (fire: () => void) => unknown;
    const clock = new VirtualClock();
    clock.install();
    try {
      let vite = false;
      let game = false;
      from("D:\\game\\node_modules\\vite\\dist\\node\\chunks\\optimizer.js")(() => (vite = true));
      from("/game/src/main.ts")(() => (game = true));
      await new Promise<void>((resolve) => realSetTimeout(resolve, 20));
      expect(vite).toBe(true);
      expect(game).toBe(false);
      clock.advance(1);
      expect(game).toBe(true);
    } finally {
      clock.uninstall();
    }
  });

  it("runs idle callbacks once per frame", () => {
    const clock = new VirtualClock();
    let runs = 0;
    const collect = () => {
      runs++;
      clock.requestIdleCallback(collect);
    };
    clock.requestIdleCallback(collect);
    const cancelled = clock.requestIdleCallback(() => {
      runs += 100;
    });
    clock.cancelIdleCallback(cancelled);
    clock.advance(3);
    expect(runs).toBe(3);
    clock.advanceTime(16);
    expect(runs).toBe(4);
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
    expect(new Date().getTime()).toBe(1100);
    expect(new Date(5).getTime()).toBe(5);
    expect(new Date() instanceof Date).toBe(true);
    expect(Date()).toBe(new Date(1100).toString());
    expect(Date.UTC(2026, 0, 1)).toBe(1767225600000);
    expect(Math.random()).toBe(mulberry32(9)());
    clock.uninstall();
    expect(new Date().getTime()).toBeGreaterThan(1100);
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
