import { Game } from "@debuffjp/core";
import { describe, expect, it, vi } from "vitest";
import { DevSession, type DrivableInput, InputRecording, type Replay } from "../src/index.js";
import { fastForward, storeRewind, takeRewind } from "../src/replay.js";

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

/** A tiny game whose state depends on held keys, params and the seeded RNG: a good determinism probe. */
function makeSim() {
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
  const speed = game.params.define("player", { speed: { type: "number", default: 1, min: 0, max: 10 } });
  const held = new Set<string>();
  const input: DrivableInput = {
    keys: { press: (c) => held.add(c), release: (c) => held.delete(c) },
    pointer: { press() {}, move() {}, release() {} },
  };
  const sim = { x: 0, noise: 0 };
  game
    .add({
      id: "play",
      update() {
        if (held.has("ArrowRight")) sim.x += speed.values.speed;
        sim.noise += game.random.next();
      },
    })
    .go("play");
  return { game, input, sim };
}

describe("fastForward", () => {
  it("reproduces a recorded session exactly, without drawing", () => {
    const live = makeSim();
    const rec = new InputRecording(live.game, live.input);
    live.game.step(10);
    live.input.keys.press("ArrowRight");
    live.game.step(20);
    live.game.params.group("player")?.set("speed", 3);
    live.game.step(15);
    live.input.keys.release("ArrowRight");
    live.game.step(5);
    const replay = rec.toReplay();

    const again = makeSim();
    const draws = vi.spyOn(again.game, "redraw");
    fastForward({ game: again.game, input: again.input, command: () => undefined }, replay.steps, replay.ticks);
    expect(again.game.clock.tick).toBe(50);
    expect(again.sim).toEqual(live.sim);
    expect(draws).toHaveBeenCalledTimes(1);

    const partial = makeSim();
    fastForward({ game: partial.game, input: partial.input, command: () => undefined }, replay.steps, 25);
    expect(partial.game.clock.tick).toBe(25);
    expect(partial.sim.x).toBe(15);
  });
});

describe("rewind", () => {
  it("carries a request across reloads for the same page only, once", () => {
    storeRewind({ v: 1, page: location.pathname, timeline: { name: "t", steps: [], ticks: 9, warnings: [] }, tick: 4 });
    expect(takeRewind()?.tick).toBe(4);
    expect(takeRewind()).toBeUndefined();
    storeRewind({ v: 1, page: "/elsewhere", timeline: { name: "t", steps: [], ticks: 9, warnings: [] }, tick: 4 });
    expect(takeRewind()).toBeUndefined();
  });

  it("keeps the old timeline while parked, and branches on new play", () => {
    const first = makeSim();
    const a = DevSession.acquire(first.game);
    a.attachInput(first.input);
    first.input.keys.press("ArrowRight");
    first.game.step(40);
    const timeline = a.known();
    a.release();

    const second = makeSim();
    const b = DevSession.acquire(second.game);
    b.attachInput(second.input);
    b.restore(
      { v: 1, page: location.pathname, timeline: timeline as Replay, tick: 10 },
      { game: second.game, input: second.input, command: () => undefined },
    );
    expect(second.sim.x).toBe(10);
    expect(b.paused).toBe(true);
    expect(b.known()?.ticks).toBe(40); // can scrub forward again
    second.game.step(1);
    expect(b.known()?.ticks).toBe(11); // played on: the old future is gone
    b.release();
  });
});
