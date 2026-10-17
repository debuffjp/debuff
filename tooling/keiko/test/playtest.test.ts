import { afterEach, describe, expect, it } from "vitest";
import { type DebuffDevHooks, debuffDriver } from "../src/driver.js";
import { describe as group, play, test } from "../src/index.js";
import { GameError, InvariantError, Playtest, TimeoutError } from "../src/playtest.js";
import { registry } from "../src/registry.js";

interface FakeState {
  x: number;
  vx: number;
  pointer: [number, number] | null;
}

/** A tiny stand-in game behind the same dev hooks a real one exposes. */
function fakeHooks(options: { throwAt?: number; random?: () => number } = {}): DebuffDevHooks {
  let tick = 0;
  const held = new Set<string>();
  const s: FakeState = { x: 0, vx: 0, pointer: null };
  const params: Record<string, number> = { speed: 2 };
  const stepOnce = () => {
    if (options.throwAt === tick + 1) throw new TypeError("player is undefined");
    const speed = params.speed ?? 0;
    s.vx = held.has("ArrowRight") ? speed : held.has("ArrowLeft") ? -speed : 0;
    s.x += s.vx + (options.random ? options.random() : 0);
    tick++;
  };
  const state = () =>
    ({
      scene: "play",
      tick,
      time: tick / 60,
      step: 1 / 60,
      frozen: false,
      pausedBy: null,
      timeScale: 1,
      renderer: "2d",
      stats: {},
      state: structuredClone(s),
      pluginNames: [],
      plugins: {},
      notes: 0,
    }) as unknown as ReturnType<DebuffDevHooks["state"]>;
  const hooks: Partial<DebuffDevHooks> = {
    controlled: true,
    state,
    step(n = 1) {
      for (let i = 0; i < n; i++) stepOnce();
      return state();
    },
    press: (c) => void held.add(c),
    release: (c) => void held.delete(c),
    tap(x, y) {
      s.pointer = [x, y];
      stepOnce();
    },
    pointerDown: (x, y) => {
      s.pointer = [x, y];
    },
    pointerMove: (x, y) => {
      s.pointer = [x, y];
    },
    pointerUp: () => {
      s.pointer = null;
    },
    params: () => ({ player: { values: { ...params } } }),
    setParam(group, key, value) {
      if (group !== "player" || !(key in params)) throw new Error(`Unknown param ${group}.${key}`);
      params[key] = Number(value);
    },
    command(name, ...args) {
      if (name === "warp") {
        s.x = Number(args[0]);
        return s.x;
      }
      throw new Error(`Unknown command "${name}"`);
    },
  };
  return hooks as DebuffDevHooks;
}

const game = (options?: Parameters<typeof fakeHooks>[0], onStep?: (state: unknown, tick: number) => void) =>
  new Playtest<FakeState>(debuffDriver(fakeHooks(options)), { root: process.cwd(), ...(onStep ? { onStep } : {}) });

describe("Playtest", () => {
  it("reads state, scene, tick, time and any dev-state path", () => {
    const g = game();
    expect(g.stepSeconds).toBeCloseTo(1 / 60);
    g.wait("0.5s");
    expect([g.scene, g.tick, g.time]).toEqual(["play", 30, 0.5]);
    expect(g.state.x).toBe(0);
    expect(g.get("state.vx")).toBe(0);
    expect(g.get("renderer")).toBe("2d");
  });

  it("drives keys and the pointer, one step at a time", () => {
    const g = game();
    g.press("ArrowRight").wait(3).release("ArrowRight").wait();
    expect(g.state).toMatchObject({ x: 6, vx: 0 });
    g.hold("ArrowLeft", 2);
    expect(g.state.x).toBe(2);
    g.tap("ArrowRight");
    expect([g.state.x, g.tick]).toEqual([4, 7]);
    g.tap(10, 20);
    expect(g.state.pointer).toEqual([10, 20]);
    g.pointerDown(1, 2).pointerMove(3, 4);
    expect(g.state.pointer).toEqual([3, 4]);
    g.pointerUp();
    expect(g.state.pointer).toBeNull();
  });

  it("sets and reads params by group.key", () => {
    const g = game();
    g.set("player.speed", 5).press("ArrowRight").wait();
    expect(g.state.x).toBe(5);
    g.set({ "player.speed": 1 });
    expect(g.param("player.speed")).toBe(1);
    expect(g.params().player?.speed).toBe(1);
    expect(() => g.set("speed", 1)).toThrow(/must be written "group.key"/);
    expect(() => g.set("player.speed", undefined as never)).toThrow(/No value given/);
    expect(() => g.param("player.jump")).toThrow(/No param "player.jump". This game has: player.speed/);
  });

  it("runs game commands", () => {
    const g = game();
    expect(g.command("warp", 40)).toBe(40);
    expect(g.state.x).toBe(40);
  });

  it("measures how long a condition takes, and times out with the last state", () => {
    const g = game();
    g.press("ArrowRight");
    expect(g.until((s) => s.x >= 10)).toBe(5);
    expect(g.until((s) => s.x >= 10)).toBe(0);
    expect(() => g.until((s) => s.x < 0, { within: 3 })).toThrow(TimeoutError);
    expect(() => g.until(() => false, { within: 2, message: "never" })).toThrow(/never didn't hold within 2 steps \(0\.03s\)\. Last state/);
  });

  it("checks invariants every step and names the step that broke", () => {
    const g = game();
    g.press("ArrowRight");
    g.during(5, (s) => s.x <= 10);
    expect(() => g.during(5, (s) => s.x <= 14, "stays left of 14")).toThrow(/stays left of 14 broke after 3 steps \(0\.05s\) \(tick 8\)/);
    expect(() =>
      g.during(2, () => {
        throw new Error("inner");
      }),
    ).toThrow(InvariantError);
  });

  it("traces a value, by path or function", () => {
    const g = game();
    g.press("ArrowRight");
    const x = g.trace("x", 3);
    expect([x.start, ...x.values]).toEqual([0, 2, 4, 6]);
    expect(g.trace((s) => s.vx, 2).values).toEqual([2, 2]);
  });

  it("turns a crash in the game into a GameError at the step that threw", () => {
    const g = game({ throwAt: 4 });
    let error: unknown;
    try {
      g.wait(10);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(GameError);
    expect(error).toMatchObject({ tick: 4, scene: "play" });
    expect((error as Error).message).toBe('the game threw at tick 4 in scene "play": player is undefined');
    expect((error as Error).cause).toBeInstanceOf(TypeError);
    expect(() => game().command("nope")).toThrow(/the game threw at tick 1/);
  });

  it("replays scenarios, checking expectations and skipping captures and browser-only paths", () => {
    const g = game();
    g.replay({
      steps: [
        { press: "ArrowRight" },
        { wait: 2 },
        { release: "ArrowRight" },
        { set: { "player.speed": 3 } },
        { tap: [1, 1] },
        { pointerDown: [2, 2] },
        { pointerMove: [3, 3] },
        { pointerUp: true },
        { command: "warp", args: [7] },
        { expect: { "state.x": { eq: 7 }, renderer: { eq: "webgl2" }, "stats.fps": { gt: 50 } } },
        { expect: { "state.x": { gt: 6, gte: 7, lt: 8, lte: 7, approx: [7, 0.1] } } },
        { capture: "done" },
      ],
    });
    expect(g.state.x).toBe(7);
    expect(() => g.replay({ steps: [{ expect: { "state.x": { lt: 0 } } }] })).toThrow(/replay step 0 .* state\.x: expected < 0, got 7/);
    expect(() => g.replay({ steps: [{ expect: { "state.x": { gt: 9 } } }] })).toThrow(/expected > 9/);
    expect(() => g.replay({ steps: [{ expect: { "state.x": { gte: 9 } } }] })).toThrow(/expected >= 9/);
    expect(() => g.replay({ steps: [{ expect: { "state.x": { lte: 1 } } }] })).toThrow(/expected <= 1/);
    expect(() => g.replay({ steps: [{ expect: { "state.x": { approx: [1, 1] } } }] })).toThrow(/expected 1 ± 1/);
    expect(() => g.replay({ steps: [{ expect: { scene: { gt: 1 } } }] })).toThrow(/expected a number/);
    expect(() => g.replay({ steps: [{ expect: { scene: { eq: "menu" } } }] })).toThrow(/expected "menu", got "play"/);
    expect(() => g.replay({ steps: [{ "tiles:paint": 1 }] })).toThrow(/only runs under `debuff scenario`/);
    expect(() => g.replay({ steps: [{ dance: 1 }] })).toThrow(/unknown step/);
    expect(() => g.replay({} as never)).toThrow(/needs a `steps` array/);
    expect(() => game({ throwAt: 1 }).replay({ steps: [{ wait: 1 }] })).toThrow(GameError);
  });

  it("reports every step to onStep when recording", () => {
    const seen: number[] = [];
    const g = game({}, (_s, tick) => seen.push(tick));
    g.wait(3).tap(0, 0);
    expect(seen).toEqual([1, 2, 3, 4]);
  });
});

describe("test registration", () => {
  const reg = registry();
  afterEach(() => {
    reg.tests = [];
    reg.suites = [];
    reg.booter = undefined;
    reg.current = undefined;
  });

  it("collects tests with their describe path and modes", () => {
    reg.file = "tests/a.test.ts";
    group("outer", () => {
      test("one", () => {});
      group.skip("skipped", () => {
        test("two", () => {});
        test.only("three", () => {});
      });
      group.only("focused", () => {
        test("four", () => {});
      });
    });
    test.skip("five");
    test.todo("six");
    test("seven", () => {}, { timeout: 5 });
    expect(reg.tests.map((t) => [t.suites.join("/"), t.name, t.mode])).toEqual([
      ["outer", "one", "run"],
      ["outer/skipped", "two", "skip"],
      ["outer/skipped", "three", "skip"],
      ["outer/focused", "four", "only"],
      ["", "five", "skip"],
      ["", "six", "todo"],
      ["", "seven", "run"],
    ]);
    expect(reg.tests.at(-1)?.timeout).toBe(5);
    expect(reg.tests[0]?.file).toBe("tests/a.test.ts");
  });

  it("rejects malformed tests and async describes", () => {
    expect(() => test("", () => {})).toThrow(/needs a name/);
    expect(() => test("x", undefined as never)).toThrow(/needs a function/);
    expect(() => group("async", (async () => {}) as never)).toThrow(/must be synchronous/);
  });

  it("expands sweeps into one test per combination, each starting with its params set", async () => {
    const booted: unknown[] = [];
    reg.booter = {
      boot: async (options) => {
        booted.push(options.params ?? {});
        return new Playtest(debuffDriver(fakeHooks()), { root: "." });
      },
    };
    const seen: unknown[] = [];
    test.sweep("moves", { "player.speed": [1, 2], "player.jump": [true] }, (_g, values) => {
      seen.push(values);
    });
    expect(reg.tests.map((t) => t.name)).toEqual(["moves [player.speed=1, player.jump=true]", "moves [player.speed=2, player.jump=true]"]);
    for (const t of reg.tests) await t.fn();
    expect(booted).toEqual([
      { "player.speed": 1, "player.jump": true },
      { "player.speed": 2, "player.jump": true },
    ]);
    expect(seen).toHaveLength(2);
    expect(() => test.sweep("empty", { "player.speed": [] }, () => {})).toThrow(/has no values to try/);
  });

  it("checks determinism by playing a script twice and diffing every step", async () => {
    let calls = 0;
    const randomness = [0, 0, 0.5];
    reg.booter = {
      boot: async (_o, hooks) => {
        const run = calls++;
        const options = run === 1 ? { random: () => randomness.shift() ?? 0 } : {};
        return new Playtest(debuffDriver(fakeHooks(options)), { root: ".", ...(hooks.onStep ? { onStep: hooks.onStep } : {}) });
      },
    };
    test.deterministic("steady", (g) => {
      g.hold("ArrowRight", 5);
    });
    test.deterministic("idle", () => {});
    const [steady, idle] = reg.tests;
    await expect(Promise.resolve().then(() => steady?.fn())).rejects.toThrow(
      /diverged at tick 3: state\.x was 6 in the first run and 6\.5 in the second/,
    );
    await expect(Promise.resolve().then(() => idle?.fn())).rejects.toThrow(/didn't play any steps/);
  });

  it("explains play() outside the runner", async () => {
    await expect(play()).rejects.toThrow(/only works inside tests run by `npx keiko`/);
  });
});
