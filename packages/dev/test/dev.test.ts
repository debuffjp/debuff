import { Game } from "@debuffjp/core";
import { describe, expect, it, vi } from "vitest";
import { exposeDevHooks } from "../src/index.js";

function setup(search = "") {
  window.history.replaceState(null, "", `/${search}`);
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
  let x = 0;
  game.params.define("player", { speed: { type: "number", default: 1, min: 0, max: 10 } });
  game.add({ id: "play", update: () => x++, inspect: () => ({ x }) }).go("play");
  const spies = { keyPress: vi.fn(), keyRelease: vi.fn(), pointerPress: vi.fn(), pointerMove: vi.fn(), pointerRelease: vi.fn() };
  const input = {
    keys: { press: spies.keyPress, release: spies.keyRelease },
    pointer: { press: spies.pointerPress, move: spies.pointerMove, release: spies.pointerRelease },
  };
  const hooks = exposeDevHooks(game, { input, agentLink: false });
  // The dev tools wrap input methods to record replays, so assert on the original spies.
  const keys = { press: spies.keyPress, release: spies.keyRelease };
  const pointer = { press: spies.pointerPress, move: spies.pointerMove, release: spies.pointerRelease };
  return { game, hooks, keys, pointer };
}

describe("exposeDevHooks", () => {
  it("runs game commands and records them in replays", () => {
    window.history.replaceState(null, "", "/");
    const canvas = document.createElement("canvas");
    const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
    vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
      type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
    const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
    game.add({ id: "play" }).go("play");
    const warp = vi.fn((to: string) => `went ${to}`);
    const input = { keys: { press: vi.fn(), release: vi.fn() }, pointer: { press: vi.fn(), move: vi.fn(), release: vi.fn() } };
    const hooks = exposeDevHooks(game, { input, commands: { warp }, agentLink: false });
    expect(hooks.commands()).toEqual(["warp"]);
    expect(hooks.command("warp", "hollow")).toBe("went hollow");
    expect(warp).toHaveBeenCalledWith("hollow");
    expect(hooks.replay().steps).toContainEqual({ command: "warp", args: ["hollow"] });
    expect(() => hooks.command("nope")).toThrow(/Unknown command "nope"\. Registered: warp/);
    game.dispose();
  });

  it("installs as a plugin and reports scene and plugin state", () => {
    const { hooks, game } = setup();
    expect(window.__DEBUFF_DEV__).toBe(hooks);
    game.inspect.register("extra", () => ({ ok: true }));
    game.inspect.register("dev-overlay", () => ({ open: true }));
    expect(hooks.step(3).plugins).toEqual({ extra: { ok: true } });
    expect(hooks.step(0)).toMatchObject({
      scene: "play",
      tick: 3,
      camera: { x: 50, y: 50, zoom: 1 },
      state: { x: 3 },
      pluginNames: ["dev-tools"],
      plugins: { extra: { ok: true } },
    });
  });

  it("removes itself on game.dispose()", () => {
    const { game } = setup();
    game.dispose();
    expect(window.__DEBUFF_DEV__).toBeUndefined();
  });

  it("enters controlled mode with ?debuff-scenario", () => {
    expect(setup("?debuff-scenario=1").hooks.controlled).toBe(true);
    expect(setup().hooks.controlled).toBe(false);
  });

  it("drives input and params", () => {
    const { hooks, keys, pointer, game } = setup();
    hooks.press("Space");
    hooks.tap(5, 6);
    expect(keys.press).toHaveBeenCalledWith("Space");
    expect(pointer.press).toHaveBeenCalledWith(5, 6);
    expect(pointer.release).toHaveBeenCalled();
    hooks.setParam("player", "speed", 4);
    expect(game.params.group("player")?.get("speed")).toBe(4);
    expect(() => hooks.setParam("nope", "x", 1)).toThrow(/Known: player/);
  });

  it("reports and forces reduced motion", () => {
    const { hooks, game } = setup();
    const before = game.reducedMotion;
    expect(hooks.state()).toMatchObject({ reducedMotion: before, reducedMotionForced: false });
    expect(hooks.state()).toMatchObject({ width: game.width, height: game.height });
    expect(hooks.reducedMotion(!before)).toMatchObject({ reducedMotion: !before, reducedMotionForced: true });
    expect(game.reducedMotion).toBe(!before);
    expect(hooks.reducedMotion(null)).toMatchObject({ reducedMotion: before, reducedMotionForced: false });
  });
});

describe("dev hooks: mouse buttons, wheel and touch", () => {
  it("drives them through @debuffjp/input's pointer, and explains an input too old for them", async () => {
    const { Pointer } = await import("../../input/src/pointer.js");
    const canvas = document.createElement("canvas");
    const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
    vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
      type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
    const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
    game.add({ id: "play", update() {} }).go("play");
    const pointer = new Pointer(canvas, (x, y) => ({ x, y }));
    const keyPress = vi.fn();
    const keys = { press: keyPress, release: vi.fn() };
    const hooks = exposeDevHooks(game, { input: { keys, pointer }, agentLink: false });
    hooks.press("PointerRight");
    hooks.wheel(-20);
    hooks.touchDown(7, 3, 4);
    expect([pointer.right.down, pointer.wheel, pointer.touches.get(7)?.kind, pointer.down, keyPress.mock.calls.length]).toEqual([
      true,
      -20,
      "touch",
      true,
      0,
    ]);
    hooks.touchMove(7, 9, 9);
    hooks.touchUp(7);
    hooks.release("PointerRight");
    expect([pointer.x, pointer.down, pointer.right.down]).toEqual([9, false, false]);
    game.dispose();

    const old = setup();
    expect(() => old.hooks.wheel(1)).toThrow(/needs @debuffjp\/input 0.16/);
    expect(() => old.hooks.press("PointerRight")).toThrow(/needs @debuffjp\/input 0.16/);
  });
});

describe("dev hooks: pointer kind", () => {
  it("presses as a mouse by default, and as a touch or pen contact when asked, never both", async () => {
    const { Pointer } = await import("../../input/src/pointer.js");
    const canvas = document.createElement("canvas");
    const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
    vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
      type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
    const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
    const seen: string[] = [];
    const pointer = new Pointer(canvas, (x, y) => ({ x, y }));
    game.add({ id: "play", update: () => seen.push(`${pointer.kind} ${pointer.down} ${pointer.touches.size}`) }).go("play");
    const hooks = exposeDevHooks(game, { input: { keys: { press() {}, release() {} }, pointer }, agentLink: false });
    // Called without a receiver, the way the agent link and scenario runners call hooks.
    const { pointerDown, pointerMove, pointerUp, tap } = hooks;
    pointerDown(10, 10);
    expect([pointer.kind, pointer.down, pointer.touches.size]).toEqual(["mouse", true, 0]);
    pointerUp();
    pointerDown(20, 20, "touch");
    pointerMove(25, 30);
    expect([pointer.kind, pointer.x, pointer.y, pointer.touches.get(1)?.kind]).toEqual(["touch", 25, 30, "touch"]);
    pointerUp();
    expect([pointer.down, pointer.touches.size]).toEqual([false, 0]);
    tap(5, 5, "pen");
    expect(seen.at(-1)).toBe("pen true 1");
    expect([pointer.down, pointer.touches.size]).toEqual([false, 0]);
    game.dispose();
  });
});
