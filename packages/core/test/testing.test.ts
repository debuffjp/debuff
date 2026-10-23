import { describe, expect, it } from "vitest";
import type { Plugin } from "../src/index.js";
import { createTestGame } from "../src/testing.js";

describe("createTestGame", () => {
  it("runs scenes, hooks and plugins without a real canvas", () => {
    const game = createTestGame({ width: 64 });
    let coins = 0;
    const counter: Plugin = {
      name: "counter",
      install: (g) => {
        const off = g.hooks.gameEvent((n) => n === "coin" && coins++);
        const offInspect = g.inspect.register("counter", () => ({ coins }));
        return () => {
          off();
          offInspect();
        };
      },
    };
    game.use(counter).add({ id: "a" }).go("a");
    game.emit("coin");
    game.step(1);
    expect(game.width).toBe(64);
    expect(game.inspect.snapshot().counter).toEqual({ coins: 1 });
    game.dispose();
    expect(game.plugins).toEqual([]);
  });
});
