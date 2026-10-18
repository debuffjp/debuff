import { describe, expect, it, vi } from "vitest";
import { FrameStats, Game, type Scene } from "../src/index.js";
import { fakeCanvas } from "./helpers.js";

// The splash art needs real text rasterising; its timing is what these tests cover.
vi.mock("../src/splash.js", () => ({ drawSplash: () => {} }));

function makeGame(extra: Partial<ConstructorParameters<typeof Game>[0]> = {}) {
  const { canvas, ctx } = fakeCanvas();
  const container = document.createElement("div");
  Object.defineProperties(container, { clientWidth: { value: 640 }, clientHeight: { value: 400 } });
  container.append(canvas);
  const game = new Game({ canvas, width: 320, height: 180, ...extra });
  return { game, canvas, ctx };
}

function recorder(id = "s") {
  const log: string[] = [];
  let updates = 0;
  const scene: Scene = {
    id,
    enter: () => log.push(`enter:${id}`),
    exit: () => log.push(`exit:${id}`),
    update: () => {
      updates++;
    },
    inspect: () => ({ updates }),
  };
  return { scene, log, updates: () => updates };
}

describe("Game", () => {
  it("runs scene lifecycle in order and rejects unknown scenes", () => {
    const { game } = makeGame();
    const a = recorder("a");
    const b = recorder("b");
    game.add(a.scene).add(b.scene);
    game.go("a");
    game.go("b");
    expect([...a.log, ...b.log]).toEqual(["enter:a", "exit:a", "enter:b"]);
    expect(() => game.go("nope")).toThrow(/Unknown scene "nope". Added: a, b/);
    expect(() => game.add(a.scene)).toThrow(/already added/);
  });

  it("steps deterministically and counts ticks", () => {
    const { game } = makeGame();
    const r = recorder();
    game.add(r.scene).go("s");
    game.step(10);
    expect(r.updates()).toBe(10);
    expect(game.clock.tick).toBe(10);
  });

  it("freeze() pauses updates without stopping rendering", async () => {
    const { game, ctx } = makeGame();
    await vi.dynamicImportSettled(); // the Canvas 2D fallback loads on demand
    const r = recorder();
    game.add(r.scene).go("s");
    game.freeze(5 / 60);
    const before = ctx.calls.filter((c) => c === "fillRect").length;
    game.step(5);
    expect(r.updates()).toBe(0);
    expect(ctx.calls.filter((c) => c === "fillRect").length).toBeGreaterThan(before);
    game.step(1);
    expect(r.updates()).toBe(1);
  });

  it("timeScale scales dt and afterUpdate hooks run after the scene", () => {
    const { game } = makeGame();
    const seen: number[] = [];
    game.add({ id: "s", update: (dt) => seen.push(dt) }).go("s");
    game.timeScale = 0.5;
    const order: string[] = [];
    const off = game.hooks.afterUpdate(() => order.push("hook"));
    game.step(1);
    off();
    game.step(1);
    expect(seen[0]).toBeCloseTo(1 / 120);
    expect(order).toEqual(["hook"]);
  });

  it("fits the canvas to its container, and integer mode snaps", () => {
    const fit = makeGame({ scale: "fit" });
    expect(fit.canvas.style.width).toBe("640px");
    expect(fit.canvas.style.height).toBe("360px");
    expect(fit.game.renderScale).toBe(2);

    const { canvas } = fakeCanvas();
    const box = document.createElement("div");
    Object.defineProperties(box, { clientWidth: { value: 500 }, clientHeight: { value: 500 } });
    box.append(canvas);
    const g = new Game({ canvas, width: 320, height: 180, scale: "integer", pixelArt: true });
    expect(canvas.style.width).toBe("320px");
    expect(g.renderScale).toBe(1);
    expect(canvas.style.imageRendering).toBe("pixelated");
  });

  it("maps client coordinates to logical coordinates", () => {
    const { game, canvas } = makeGame();
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 640, height: 360 }) as DOMRect;
    expect(game.toLogical(10 + 320, 20 + 180)).toEqual({ x: 160, y: 90 });
  });
});

describe("FrameStats", () => {
  it("summarises interval and work time", () => {
    const s = new FrameStats(4);
    for (const w of [1, 2, 3, 10]) s.record(1000 / 60, w);
    const sum = s.summary();
    expect(sum.fps).toBe(60);
    expect(sum.workMs).toBe(4);
    expect(sum.workP95Ms).toBe(10);
    expect(sum.samples).toBe(4);
  });
});

describe("reduced motion", () => {
  it("follows prefers-reduced-motion live and scales camera shake", () => {
    let listener: (() => void) | undefined;
    const query = { matches: true, addEventListener: (_: string, fn: () => void) => (listener = fn), removeEventListener: () => {} };
    const other = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
    vi.stubGlobal("matchMedia", (q: string) => (q.includes("reduced-motion") ? query : other));
    const { game } = makeGame();
    expect(game.reducedMotion).toBe(true);
    expect(game.camera.motionScale).toBe(0.25);
    query.matches = false;
    listener?.();
    expect(game.reducedMotion).toBe(false);
    expect(game.camera.motionScale).toBe(1);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("can be forced either way", () => {
    expect(makeGame({ reducedMotion: true }).game.camera.motionScale).toBe(0.25);
    expect(makeGame({ reducedMotion: false }).game.reducedMotion).toBe(false);
  });
});

describe("Game splash", () => {
  function withRaf() {
    vi.stubEnv("DEV", false);
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => callbacks.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let now = performance.now();
    return (ms: number) => {
      now += ms;
      const cb = callbacks.shift();
      cb?.(now);
    };
  }

  it("holds the first frame for its duration, then starts time", () => {
    const tick = withRaf();
    const { game } = makeGame({ splash: { duration: 0.5 } });
    game.start();
    for (let i = 0; i < 4; i++) tick(100);
    expect(game.clock.tick).toBe(0);
    for (let i = 0; i < 4; i++) tick(100);
    expect(game.clock.tick).toBeGreaterThan(0);
    game.dispose();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is skipped by any key and never affects step()", () => {
    const tick = withRaf();
    const { game } = makeGame({ splash: { duration: 5 } });
    game.step(3);
    expect(game.clock.tick).toBe(3);
    game.start();
    tick(16);
    dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    tick(16);
    tick(16);
    expect(game.clock.tick).toBeGreaterThan(3);
    game.dispose();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("can be turned off", () => {
    const tick = withRaf();
    const { game } = makeGame({ splash: false });
    game.start();
    tick(16);
    tick(16);
    expect(game.clock.tick).toBeGreaterThan(0);
    game.dispose();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("Game splash", () => {
  it("a click, tap or key skips it, and nothing links out of the game (portal rules)", () => {
    vi.stubEnv("DEV", false);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const showing = (g: unknown) => (g as { splashTotal: number }).splashTotal > 0;
    const { game, canvas } = makeGame({ splash: true });
    if (canvas.parentElement) document.body.append(canvas.parentElement);
    expect(showing(game)).toBe(true);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(showing(game)).toBe(false);
    const second = makeGame({ splash: true });
    dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    expect(showing(second.game)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    game.dispose();
    second.game.dispose();
    open.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe("Game loop errors", () => {
  it("stops cleanly, reports where it broke, and can be started again", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => callbacks.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { game } = makeGame({ splash: false });
    let broken = true;
    game
      .add({
        id: "play",
        update: () => {
          if (broken) throw new TypeError("boom");
        },
      })
      .go("play");
    const seen: unknown[] = [];
    game.hooks.error((_err, ctx) => seen.push(ctx));
    game.start();
    expect(() => callbacks.shift()?.(performance.now() + 20)).toThrow("boom");
    expect(game.isRunning).toBe(false);
    expect(seen).toEqual([{ phase: "update", scene: "play", tick: 0 }]);
    expect(game.lastError?.phase).toBe("update");
    broken = false;
    game.start();
    expect(game.isRunning).toBe(true);
    expect(game.lastError).toBeUndefined();
    game.dispose();
    vi.unstubAllGlobals();
  });
});
