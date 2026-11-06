import { Game } from "@debuffjp/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Gamepads } from "../../input/src/gamepad.js";
import { Pointer } from "../../input/src/pointer.js";
import { DevSession, type DrivableInput, InputRecording, type Replay } from "../src/index.js";
import { checkpointDrift, checkpointOf, fastForward, type RewindRequest, storeRewind, takeRewind } from "../src/replay.js";

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
function makeSim(seed?: number) {
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  const game = new Game({ canvas, width: 100, height: 100, scale: "none", ...(seed === undefined ? {} : { seed }) });
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
      inspect: () => ({ ...sim }),
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

describe("state-preserving reload", () => {
  it("saves the session, then the new page replays it to the same tick and keeps running", () => {
    const first = makeSim();
    const a = DevSession.acquire(first.game);
    a.attachInput(first.input);
    first.input.keys.press("ArrowRight"); // still held when the code changes
    first.game.step(30);
    a.keepForReload();
    a.release();

    const request = takeRewind();
    expect(request).toMatchObject({ reason: "reload", tick: 30, resume: true });

    const second = makeSim();
    const b = DevSession.acquire(second.game);
    b.attachInput(second.input);
    b.restore(request as RewindRequest, { game: second.game, input: second.input, command: () => undefined });
    expect(second.game.clock.tick).toBe(30);
    expect(second.sim).toEqual(first.sim);
    expect(b.paused).toBe(false);
    second.game.step(5);
    expect(second.sim.x).toBe(30); // the replay let go of ArrowRight: nobody is holding it now
    expect(b.activity.at(-1)?.action).toBe("kept your place");
    b.release();
  });
});

describe("checkpoints", () => {
  /** Record `ticks` of play holding ArrowRight from tick 60, through a dev session (which records checkpoints). */
  function record(ticks: number) {
    const live = makeSim();
    const session = DevSession.acquire(live.game);
    session.attachInput(live.input);
    live.game.step(60);
    live.input.keys.press("ArrowRight");
    live.game.step(ticks - 60);
    const replay = session.known() as Replay;
    session.release();
    return replay;
  }
  const target = (sim: ReturnType<typeof makeSim>) => ({ game: sim.game, input: sim.input, command: () => undefined });

  it("hash each part of the state every 60 ticks, after that tick's input", () => {
    const replay = record(130);
    expect(replay.steps.map((s) => Object.keys(s)[0])).toEqual(["wait", "press", "checkpoint", "wait", "checkpoint", "wait"]);
    expect(Object.keys((replay.steps[2] as { checkpoint: object }).checkpoint)).toEqual(["scene", "events", "state.x", "state.noise"]);
  });

  it("let a replay name the first tick and parts that stopped matching", () => {
    const replay = record(200);
    const same = makeSim();
    const verify = (sim: ReturnType<typeof makeSim>) => () =>
      checkpointOf({ scene: sim.game.scene?.id, state: sim.game.scene?.inspect?.(), plugins: {}, events: {} });
    expect(fastForward(target(same), replay.steps, replay.ticks, verify(same))).toBeUndefined();

    const bumped = makeSim();
    bumped.game.hooks.afterUpdate(() => {
      if (bumped.game.clock.tick === 130) bumped.sim.x += 1;
    });
    expect(fastForward(target(bumped), replay.steps, replay.ticks, verify(bumped))).toEqual({
      tick: 180,
      matched: 120,
      parts: ["state.x"],
    });

    const reseeded = makeSim(2);
    expect(fastForward(target(reseeded), replay.steps, replay.ticks, verify(reseeded))).toEqual({
      tick: 60,
      matched: 0,
      parts: ["state.noise"],
    });
  });

  it("warn when a rewind doesn't reproduce the session, but not after a code reload", () => {
    const replay = record(130);
    for (const reason of ["rewind", "reload"] as const) {
      const sim = makeSim(2);
      const session = DevSession.acquire(sim.game);
      session.attachInput(sim.input);
      session.restore({ v: 1, page: location.pathname, timeline: replay, tick: 130, reason }, target(sim));
      const warnings = session.recording?.toReplay().warnings ?? [];
      if (reason === "rewind") {
        expect(warnings).toEqual([expect.stringContaining("state.noise differed from the recording at tick 60")]);
        expect(session.activity.at(-1)?.action).toBe("rewind drifted");
      } else expect(warnings).toEqual([]);
      session.release();
    }
  });

  it("split plugins and non-object state, and count parts only one side has as different", () => {
    const a = checkpointOf({ scene: "play", state: 3, plugins: { tilemap: { w: 2 } }, events: { coin: 1 } });
    expect(Object.keys(a)).toEqual(["scene", "events", "state", "plugins.tilemap"]);
    const b = checkpointOf({ scene: "play", state: 3, plugins: {}, events: { coin: 2 } });
    expect(checkpointDrift(a, b)).toEqual(["events", "plugins.tilemap"]);
  });

  it("skip a state that can't be serialised and keep the game running", () => {
    const sim = makeSim();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const rec = new InputRecording(sim.game, sim.input, () => checkpointOf({ scene: "play", state: cyclic, plugins: {}, events: {} }));
    sim.game.step(130);
    expect(sim.game.clock.tick).toBe(130);
    expect(rec.toReplay().steps).toEqual([{ wait: 130 }]);
  });
});

/** A game driven only by a gamepad, polled after each update like `@debuffjp/input` does. */
function makePadSim() {
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
  const pads = new Gamepads();
  const input: DrivableInput = { keys: { press() {}, release() {} }, pointer: { press() {}, move() {}, release() {} }, pads };
  const sim = { x: 0, y: 0, jumps: 0, trace: [] as string[] };
  game.hooks.afterUpdate(() => pads.poll());
  game
    .add({
      id: "play",
      update() {
        sim.x += pads.stickX;
        sim.y += pads.stickY;
        if (pads.pressed("PadA")) sim.jumps++;
        sim.trace.push(`${pads.connected}:${pads.down("PadA")}:${pads.stickX}`);
      },
    })
    .go("play");
  return { game, input, pads, sim };
}

describe("gamepad replay", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("records pad state per poll and replays it exactly", () => {
    const pad = { connected: true, buttons: [{ pressed: false }], axes: [0, 0] };
    let pads: (typeof pad | null)[] = [];
    vi.stubGlobal("navigator", { getGamepads: () => pads });
    const live = makePadSim();
    const rec = new InputRecording(live.game, live.input);
    live.game.step(3);
    pads = [pad];
    live.game.step(2);
    pad.axes = [-0.7312345678, 0.4567891234];
    live.game.step(4);
    pad.buttons = [{ pressed: true }];
    live.game.step(1);
    pad.buttons = [{ pressed: false }];
    pad.axes = [0.1, 0];
    live.game.step(3);
    pad.buttons = [{ pressed: true }];
    live.game.step(2);
    pads = [];
    live.game.step(2);
    const replay = rec.toReplay();
    expect(replay.steps).toContainEqual({ pad: { buttons: [], axes: [-0.7312345678, 0.4567891234] } });
    expect(replay.steps.filter((s) => "pad" in s)).toHaveLength(6);
    expect(JSON.parse(JSON.stringify(replay))).toEqual(replay); // survives sessionStorage / scenario files

    // Another real pad is plugged in during the replay: it must not leak into the replayed session.
    pads = [{ connected: true, buttons: [{ pressed: true }], axes: [1, 1] }];
    const again = makePadSim();
    const rec2 = new InputRecording(again.game, again.input);
    fastForward({ game: again.game, input: again.input, command: () => undefined }, replay.steps, replay.ticks);
    expect(again.sim).toEqual(live.sim);
    expect(again.sim.jumps).toBe(2);
    expect(rec2.toReplay().steps).toEqual(replay.steps); // the new page keeps the same timeline
    expect(again.pads.fed).toBeUndefined(); // the real pad takes over afterwards
  });

  it("still loads replays recorded before pads were recorded", () => {
    vi.stubGlobal("navigator", { getGamepads: () => [] });
    const sim = makePadSim();
    fastForward({ game: sim.game, input: sim.input, command: () => undefined }, [{ wait: 5 }, { press: "Space" }, { wait: 5 }], 10);
    expect(sim.game.clock.tick).toBe(10);
    expect(sim.sim.x).toBe(0);
  });
});

describe("pointer buttons in replays", () => {
  it("records the right and middle buttons as presses of their binding names, and plays them back", () => {
    const game = makeGame();
    const held = new Set<string>();
    const input: DrivableInput = {
      keys: { press: () => {}, release: () => {} },
      pointer: {
        press() {},
        move() {},
        release() {},
        pressButton: (b) => held.add(b),
        releaseButton: (b) => held.delete(b),
      },
    };
    const rec = new InputRecording(game, input);
    game.step(2);
    input.pointer.pressButton?.("right");
    input.pointer.pressButton?.("right"); // held: not recorded twice
    game.step(1);
    input.pointer.releaseButton?.("right");
    const steps = rec.toReplay().steps;
    expect(steps).toEqual([{ wait: 2 }, { press: "PointerRight" }, { wait: 1 }, { release: "PointerRight" }]);
    rec.dispose();
    const seen: string[] = [];
    input.pointer.pressButton = (b) => seen.push(`down ${b}`);
    input.pointer.releaseButton = (b) => seen.push(`up ${b}`);
    fastForward({ game: makeGame(), input, command: () => undefined }, [...steps, { press: "PointerMiddle" }, { wait: 1 }], 4);
    expect(seen).toEqual(["down right", "up right", "down middle", "up middle"]);
  });

  it("explains a PointerRight press on an input too old to have buttons", () => {
    const { input } = makeInput();
    expect(() => fastForward({ game: makeGame(), input, command: () => undefined }, [{ press: "PointerRight" }], 1)).toThrow(
      /needs @debuffjp\/input 0.16/,
    );
  });
});

describe("wheel and touch in replays", () => {
  function realInput() {
    const pointer = new Pointer(document.createElement("canvas"), (x, y) => ({ x, y }));
    const input: DrivableInput = { keys: { press() {}, release() {} }, pointer };
    return { input, pointer };
  }

  it("records touches as touch steps (not also as the pointer presses they make) and wheel scrolls", () => {
    const game = makeGame();
    const { input, pointer } = realInput();
    const rec = new InputRecording(game, input);
    pointer.touchStart(3, 10, 20);
    pointer.touchStart(4, 5, 5, "pen");
    game.step(1);
    pointer.touchMove(3, 11, 21);
    pointer.touchMove(3, 12, 22); // same tick: collapsed
    pointer.scroll(-30);
    pointer.scroll(4, 2);
    pointer.touchEnd(3);
    pointer.touchStart(1, 0, 0, "mouse"); // a mouse contact stays a pointer step
    pointer.touchEnd(1);
    expect(rec.toReplay().steps).toEqual([
      { touchDown: [3, 10, 20] },
      { touchDown: [4, 5, 5, "pen"] },
      { wait: 1 },
      { touchMove: [3, 12, 22] },
      { wheel: -30 },
      { wheel: [4, 2] },
      { touchUp: 3 },
      { pointerDown: [0, 0] },
      { pointerUp: true },
    ]);
    rec.dispose();
  });

  it("plays touch and wheel steps back, and lifts touches still down at the end", () => {
    const { input, pointer } = realInput();
    const seen: string[] = [];
    const game = makeGame();
    game.add({ id: "watch", update: () => seen.push(`${pointer.touches.size} ${pointer.down} ${pointer.wheel}`) }).go("watch");
    game.hooks.afterUpdate(() => pointer.endStep());
    fastForward(
      { game, input, command: () => undefined },
      [{ touchDown: [1, 5, 5] }, { touchDown: [2, 9, 9] }, { wheel: 12 }, { wait: 1 }, { touchUp: 1 }, { wait: 1 }],
      2,
    );
    expect(seen).toEqual(["2 true 12", "1 false 0"]);
    expect(pointer.touches.size).toBe(0);
  });
});
