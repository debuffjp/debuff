import { describe, expect, it, vi } from "vitest";
import { debuffSans, FrameStats, Game, type Scene } from "../src/index.js";
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
  it("renders through spryte with debuff sans as the default font", () => {
    const { game } = makeGame();
    expect(game.draw.font).toBe(debuffSans);
    expect(game.draw.measure("hi")).toEqual(debuffSans().measure("hi"));
  });

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

  it("expand mode grows the logical size along the spare axis, and follows the container", () => {
    // 640x400 container, 320x180 minimum: scale 2 fits the width, so the height grows to 200.
    const { game, canvas } = makeGame({ scale: "expand" });
    expect([game.width, game.height]).toEqual([320, 200]);
    expect(canvas.style.width).toBe("640px");
    expect(canvas.style.height).toBe("400px");
    expect([game.camera.width, game.camera.height, game.camera.y]).toEqual([320, 200, 100]);

    // A portrait game in a landscape container widens instead.
    const { canvas: c2 } = fakeCanvas();
    const box = document.createElement("div");
    let w = 1000;
    Object.defineProperties(box, { clientWidth: { get: () => w }, clientHeight: { value: 640 } });
    box.append(c2);
    const portrait = new Game({ canvas: c2, width: 360, height: 640, scale: "expand" });
    const sizes: number[][] = [];
    portrait.hooks.resize((width, height) => sizes.push([width, height]));
    expect([portrait.width, portrait.height]).toEqual([1000, 640]);
    // Narrower than the minimum: it never shrinks below 360 wide, it scales down instead.
    w = 180;
    portrait.resize();
    expect([portrait.width, portrait.height]).toEqual([360, 1280]);
    expect(sizes).toEqual([[360, 1280]]);
  });

  it("pixel mode keeps a fixed size per unit and shows more of the game in a bigger container", () => {
    const { canvas } = fakeCanvas();
    const box = document.createElement("div");
    let size = [1920, 1080];
    Object.defineProperties(box, { clientWidth: { get: () => size[0] }, clientHeight: { get: () => size[1] } });
    box.append(canvas);
    const g = new Game({ canvas, width: 320, height: 180, scale: "pixel", pixelSize: 3, pixelArt: true });
    expect([g.width, g.height]).toEqual([640, 360]);
    expect(g.renderScale).toBe(3);
    // A bigger window: same 3 pixels per unit, more units.
    size = [2560, 1440];
    g.resize();
    expect([g.width, g.height]).toEqual([853, 480]);
    expect(g.renderScale).toBe(3);
    // A common laptop size with a 640x360 minimum would drop to 2 (see the next game); here 3 still fits.
    size = [1366, 768];
    g.resize();
    expect([g.width, g.height]).toEqual([455, 256]);
    // Too small for the 320x180 minimum at 3: it scales down by whole pixels and keeps the minimum.
    size = [700, 400];
    g.resize();
    expect([g.width, g.height]).toEqual([350, 200]);
    expect(g.renderScale).toBe(2);

    // A 640x360 minimum at 1366x768 can't fit at 3, so it falls to 2: 683x384.
    const { canvas: c2 } = fakeCanvas();
    const box2 = document.createElement("div");
    Object.defineProperties(box2, { clientWidth: { value: 1366 }, clientHeight: { value: 768 } });
    box2.append(c2);
    const wide = new Game({ canvas: c2, width: 640, height: 360, scale: "pixel", pixelSize: 3 });
    expect([wide.width, wide.height, wide.renderScale]).toEqual([683, 384, 2]);
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

describe("Game dev warnings", () => {
  function setup() {
    vi.stubEnv("DEV", true);
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    return warn;
  }
  function teardown() {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  }

  it("warns when start() runs with no active scene, naming the added scenes", () => {
    const warn = setup();
    const { game } = makeGame({ splash: false });
    game.add(recorder("play").scene);
    game.start();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("game.go(id)"));
    expect(warn.mock.calls[0][0]).toContain("play");
    game.dispose();
    teardown();
  });

  it("warns when scenes are added but the game never starts", () => {
    const warn = setup();
    const { game } = makeGame({ splash: false });
    game.add(recorder("play").scene);
    vi.advanceTimersByTime(2500);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("game.start() was never called"));
    game.dispose();
    teardown();
  });

  it("stays quiet for a correct start, and for games driven by step()", () => {
    const warn = setup();
    const a = makeGame({ splash: false }).game;
    a.add(recorder("play").scene).go("play");
    a.start();
    const b = makeGame({ splash: false }).game;
    b.add(recorder("play").scene).go("play");
    b.step(1);
    vi.advanceTimersByTime(2500);
    expect(warn).not.toHaveBeenCalled();
    a.dispose();
    b.dispose();
    teardown();
  });
});
