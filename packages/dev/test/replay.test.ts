import { Game } from "@debuffjp/core";
import { describe, expect, it, vi } from "vitest";
import { type DrivableInput, InputRecording } from "../src/index.js";

function makeGame() {
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
  game.params.define("player", { speed: { type: "number", default: 1, min: 0, max: 10 } });
  game.add({ id: "play", update() {} }).go("play");
  return game;
}

function makeInput() {
  const calls: string[] = [];
  const input: DrivableInput = {
    keys: { press: (c) => calls.push(`press ${c}`), release: (c) => calls.push(`release ${c}`) },
    pointer: { press: () => calls.push("down"), move: () => calls.push("move"), release: () => calls.push("up") },
  };
  return { input, calls };
}

describe("InputRecording", () => {
  it("turns input and param changes into scenario steps by tick", () => {
    const game = makeGame();
    const { input, calls } = makeInput();
    const rec = new InputRecording(game, input);
    game.step(3);
    input.keys.press("ArrowRight");
    input.keys.press("ArrowRight"); // held repeat: not recorded twice
    game.step(5);
    input.keys.release("ArrowRight");
    input.pointer.press(1.234, 5);
    input.pointer.move(2, 2);
    input.pointer.move(3, 3); // same tick: collapsed
    input.pointer.release();
    game.params.group("player")?.set("speed", 4);
    game.step(2);
    expect(calls).toContain("press ArrowRight");
    expect(rec.toReplay().steps).toEqual([
      { wait: 3 },
      { press: "ArrowRight" },
      { wait: 5 },
      { release: "ArrowRight" },
      { pointerDown: [1.23, 5] },
      { pointerMove: [3, 3] },
      { pointerUp: true },
      { set: { "player.speed": 4 } },
      { wait: 2 },
    ]);
    expect(rec.toReplay(4).steps).toEqual([{ wait: 3 }, { press: "ArrowRight" }, { wait: 1 }]);
  });

  it("warns and restores the input on dispose", () => {
    const game = makeGame();
    const { input } = makeInput();
    const press = input.keys.press;
    const rec = new InputRecording(game, input);
    expect(input.keys.press).not.toBe(press);
    rec.warn("slow");
    expect(rec.toReplay().warnings).toEqual(["slow"]);
    rec.dispose();
    expect(input.keys.press).toBe(press);
  });
});
