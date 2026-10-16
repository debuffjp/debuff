import { describe, expect, it, vi } from "vitest";
import { FrameStats, Game, type Scene } from "../src/index.js";
import { fakeCanvas } from "./helpers.js";

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

  it("freeze() pauses updates without stopping rendering", () => {
    const { game, ctx } = makeGame();
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
  });

  it("can be forced either way", () => {
    expect(makeGame({ reducedMotion: true }).game.camera.motionScale).toBe(0.25);
    expect(makeGame({ reducedMotion: false }).game.reducedMotion).toBe(false);
  });
});
