import { Game } from "@debuffjp/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevSession, diagnose, exposeDevHooks, type FrameSample, summarize } from "../src/index.js";

function makeGame() {
  window.history.replaceState(null, "", "/");
  const canvas = document.createElement("canvas");
  const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? canvas : () => undefined), set: () => true });
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  const game = new Game({ canvas, width: 100, height: 100, scale: "none" });
  game.params.define("player", { speed: { type: "number", default: 1, min: 0, max: 10 } });
  game.add({ id: "play", update() {}, inspect: () => ({ hp: 3 }) }).go("play");
  return game;
}

const sample = (s: Partial<FrameSample>): FrameSample => ({
  tick: 1,
  scene: "play",
  intervalMs: 16,
  updateMs: 1,
  renderMs: 1,
  steps: 1,
  quads: 10,
  drawCalls: 1,
  longTaskMs: 0,
  at: 0,
  ...s,
});

describe("DevSession", () => {
  it("is shared per game and released by refcount", () => {
    const game = makeGame();
    const a = DevSession.acquire(game);
    expect(DevSession.acquire(game)).toBe(a);
    a.release();
    a.release();
    expect(DevSession.acquire(game)).not.toBe(a);
  });

  it("records a frame per step with steps and quads", () => {
    const game = makeGame();
    const s = DevSession.acquire(game);
    game.step(3);
    expect(s.recorder.length).toBeGreaterThan(0);
    const last = s.recorder.recent(1)[0];
    expect(last).toMatchObject({ scene: "play", tick: 3 });
    expect(s.recorder.recent(1000).length).toBe(s.recorder.length);
    s.release();
  });

  it("pauses, steps and logs who did it; setParam is undoable", () => {
    const game = makeGame();
    const s = DevSession.acquire(game);
    s.step(2, "agent");
    expect(s.pausedBy).toBe("agent");
    expect(game.clock.tick).toBe(2);
    s.setParam("player", "speed", 5, "agent");
    expect(s.activity.map((a) => a.action)).toEqual(["paused", "set"]);
    s.activity.at(-1)?.undo?.();
    expect(game.params.group("player")?.get("speed")).toBe(1);
    s.resume("you");
    expect(s.paused).toBe(false);
    expect(() => s.setParam("nope", "x", 1)).toThrow(/Known: player/);
    s.release();
  });

  it("captures notes with state and tracks agent presence", () => {
    const game = makeGame();
    const s = DevSession.acquire(game);
    expect(s.agentConnected).toBe(false);
    s.agentSeen();
    expect(s.agentConnected).toBe(true);
    s.agentLastSeenAt = Number.NEGATIVE_INFINITY;
    s.setAgentsAttached(1);
    expect(s.agentConnected).toBe(true);
    s.setAgentsAttached(0);
    expect(s.agentConnected).toBe(false);
    expect(s.activity.map((a) => a.action)).toEqual(["connected", "connected", "disconnected"]);
    expect(s.note("jump feels floaty")).toMatchObject({ id: 1, text: "jump feels floaty", state: { hp: 3 } });
    s.release();
  });
});

describe("diagnose", () => {
  it("explains slow frames in plain words", () => {
    expect(diagnose(sample({}))).toBe("on budget");
    expect(diagnose(sample({ intervalMs: 40, updateMs: 30 }))).toMatch(/update took 30.0 ms/);
    expect(diagnose(sample({ intervalMs: 40, renderMs: 30, quads: 900 }))).toMatch(/render took .*900 quads/);
    expect(diagnose(sample({ intervalMs: 40, steps: 3 }))).toMatch(/caught up 3 steps/);
    expect(diagnose(sample({ intervalMs: 90, longTaskMs: 70 }))).toMatch(/70 ms main-thread stall/);
    expect(diagnose(sample({ intervalMs: 40 }))).toMatch(/time went elsewhere/);
  });
});

describe("dev hooks with a session", () => {
  it("pause, frames and notes go through the shared session", () => {
    const game = makeGame();
    const hooks = exposeDevHooks(game, { agentLink: false });
    expect(hooks.pause()).toMatchObject({ pausedBy: "agent" });
    hooks.step(2);
    expect(hooks.frames(1)).toHaveLength(1);
    DevSession.acquire(game).note("here");
    expect(hooks.notes()[0]?.text).toBe("here");
    expect(hooks.resume().pausedBy).toBeNull();
    game.dispose();
  });
});

describe("summarize", () => {
  it("separates normal jitter, the game's own hitches and outside hitches", () => {
    const frames = [
      sample({ intervalMs: 16.7 }),
      sample({ intervalMs: 20 }), // jitter: not a hitch
      sample({ intervalMs: 40, updateMs: 30 }), // the game's fault
      sample({ intervalMs: 50 }), // outside the game
    ];
    expect(summarize(frames)).toMatchObject({ frames: 4, hitches: 2, gameHitches: 1, outsideHitches: 1 });
    expect(diagnose(sample({ intervalMs: 20 }))).toMatch(/jitter/);
  });
});

describe("DevSession errors", () => {
  // Explaining an error fetches its source map; there's no dev server here, so keep that offline and quiet.
  beforeEach(() => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("counts repeats of the same error even after its location is source-mapped", () => {
    const game = makeGame();
    const s = DevSession.acquire(game);
    const boom = () => {
      const e = new TypeError("x is undefined");
      e.stack = "TypeError: x is undefined\n    at update (http://localhost:3000/src/main.ts:5:1)";
      return e;
    };
    dispatchEvent(new ErrorEvent("error", { error: boom() }));
    const first = s.errors[0];
    if (first?.where) first.where = { ...first.where, line: 2 }; // as if mapped
    dispatchEvent(new ErrorEvent("error", { error: boom() }));
    dispatchEvent(new ErrorEvent("error", { error: boom() }));
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]?.count).toBe(3);
    s.release();
  });
});
