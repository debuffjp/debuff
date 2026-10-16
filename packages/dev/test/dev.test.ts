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
  const hooks = exposeDevHooks(game, { input });
  // The dev tools wrap input methods to record replays, so assert on the original spies.
  const keys = { press: spies.keyPress, release: spies.keyRelease };
  const pointer = { press: spies.pointerPress, move: spies.pointerMove, release: spies.pointerRelease };
  return { game, hooks, keys, pointer };
}

describe("exposeDevHooks", () => {
  it("installs as a plugin and reports scene and plugin state", () => {
    const { hooks, game } = setup();
    expect(window.__DEBUFF_DEV__).toBe(hooks);
    game.inspect.register("extra", () => ({ ok: true }));
    expect(hooks.step(3)).toMatchObject({
      scene: "play",
      tick: 3,
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
});
