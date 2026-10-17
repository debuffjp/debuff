/**
 * keiko (稽古, "practice"): fast, deterministic tests for web games. Your real game runs in Node, with no
 * browser and nothing drawn, and time, input and randomness only move when the test says so.
 * Works with any engine that runs in a browser; debuff games are driven through their dev hooks.
 * Run tests with `npx keiko` (or `npx debuff test` in a debuff project).
 *
 * ```ts
 * // tests/movement.test.ts
 * import { expect, play, test } from "keiko";
 *
 * test("buff reaches top speed within a quarter second", async () => {
 *   const game = await play();
 *   game.press("ArrowRight");
 *   expect(game.until((s) => s.player.vx >= 140)).toBeAtMost(15);
 * });
 * ```
 *
 * Guide: https://debuff.jp/docs/testing
 *
 * @packageDocumentation
 */

import type { KeikoHooks } from "./driver.js";
import type { ParamValue, Playtest } from "./playtest.js";
import { type PlayOptions, registry, type TestCase, type TestOptions } from "./registry.js";
import { firstDifference, show } from "./values.js";

export { mulberry32, VirtualClock } from "./clock.js";
export { type Driver, type KeikoHooks, MissingHookError } from "./driver.js";
export type { Duration } from "./duration.js";
export { ExpectationError, expect, type Matchers } from "./expect.js";
export { type Condition, GameError, InvariantError, type ParamValue, Playtest, type ScenarioSource, TimeoutError } from "./playtest.js";
export type { PlayOptions, TestOptions } from "./registry.js";
export { Trace } from "./trace.js";

const DEFAULT_TIMEOUT = 30_000;

/** A test body. It can be async; most are, because {@link play} is. */
export type TestFn = () => unknown;

interface TestApi {
  /**
   * Register a test. The body usually starts with `const game = await play()`, plays a little,
   * and asserts with {@link expect}. Each test gets a fresh game.
   */
  (name: string, fn: TestFn, options?: TestOptions): void;
  /** Run only this test (and other `.only` tests) in the run. Handy while working on one behaviour. */
  only(name: string, fn: TestFn, options?: TestOptions): void;
  /** Register a test without running it. It shows as skipped. */
  skip(name: string, fn?: TestFn, options?: TestOptions): void;
  /** A test you mean to write. It shows as a todo in the report. */
  todo(name: string): void;
  /**
   * The same test across param values: one test per combination, each starting from a fresh game
   * with those params set. The name gets the values appended, so a failure says which combination broke.
   *
   * ```ts
   * test.sweep("clears the first gap", { "player.jumpSpeed": [260, 290, 320], "player.gravity": [800, 900] }, (game) => {
   *   game.hold("ArrowRight", "0.4s").tap("Space");
   *   game.until((s) => s.player.x > 120, { within: "2s" });
   * });
   * ```
   */
  sweep(name: string, grid: Record<string, readonly ParamValue[]>, fn: SweepFn, options?: SweepOptions): void;
  /**
   * Play the same script twice on fresh games and compare the state after every step. Fails at the
   * first step where the two runs differ, naming the path that diverged.
   *
   * The second run gets a different `Math.random()` seed and starts at a different date, so game logic
   * that depends on unseeded randomness or the wall clock is caught: those break replays, scenarios and
   * bug reports. If your engine seeds its own generator from `Math.random()` on purpose, pass
   * `{ sameSeed: true }` to check everything else.
   *
   * ```ts
   * test.deterministic("ten seconds of play are reproducible", (game) => {
   *   game.hold("ArrowRight", "2s").tap("Space").wait("8s");
   * });
   * ```
   */
  deterministic(name: string, script: (game: Playtest) => unknown, options?: DeterministicOptions): void;
}

/** A sweep body: the booted game with the combination's params already set, and those values. */
export type SweepFn = (game: Playtest, values: Record<string, ParamValue>) => unknown;

/** Options for {@link test.sweep}. */
export interface SweepOptions extends TestOptions {
  /** How to boot each game. */
  play?: PlayOptions;
}

/** Options for {@link test.deterministic}. */
export interface DeterministicOptions extends SweepOptions {
  /** Give both runs the same `Math.random()` seed. Default false: different seeds expose unseeded randomness. */
  sameSeed?: boolean;
}

function add(name: string, fn: TestFn, mode: TestCase["mode"], options: TestOptions = {}): void {
  const r = registry();
  if (typeof name !== "string" || !name) throw new TypeError("test() needs a name");
  if (mode !== "todo" && typeof fn !== "function") throw new TypeError(`test "${name}" needs a function`);
  // A skipped or focused describe passes its mode down, unless the test asks for something stronger.
  const inherited = r.suites.reduce<TestCase["mode"]>(
    (m, s) => (s.mode === "skip" ? "skip" : s.mode === "only" && m === "run" ? "only" : m),
    "run",
  );
  const effective = mode === "run" ? inherited : mode === "only" && inherited === "skip" ? "skip" : mode;
  r.tests.push({
    file: r.file,
    suites: r.suites.map((s) => s.name),
    name,
    fn,
    mode: effective,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
  });
}

/** Register a test. See {@link TestApi}. */
export const test: TestApi = Object.assign((name: string, fn: TestFn, options?: TestOptions) => add(name, fn, "run", options), {
  only: (name: string, fn: TestFn, options?: TestOptions) => add(name, fn, "only", options),
  skip: (name: string, fn?: TestFn, options?: TestOptions) => add(name, fn ?? (() => {}), "skip", options),
  todo: (name: string) => add(name, () => {}, "todo"),
  sweep(name: string, grid: Record<string, readonly ParamValue[]>, fn: SweepFn, options: SweepOptions = {}) {
    for (const values of combinations(grid)) {
      const label = Object.entries(values)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(", ");
      add(
        `${name} [${label}]`,
        async () => {
          const game = await play({ ...options.play, params: { ...options.play?.params, ...values } });
          await fn(game, values);
        },
        "run",
        options,
      );
    }
  },
  deterministic(name: string, script: (game: Playtest) => unknown, options: DeterministicOptions = {}) {
    add(
      name,
      async () => {
        const record = async (seed: number) => {
          const states: { tick: number; state: unknown }[] = [];
          const game = await bootGame({ ...options.play, seed }, { onStep: (state, tick) => states.push({ tick, state }) });
          await script(game);
          return states;
        };
        const seed = options.play?.seed ?? 1;
        const a = await record(seed);
        const b = await record(options.sameSeed ? seed : seed + 7919);
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) {
          const path = firstDifference(a[i]?.state, b[i]?.state);
          if (path === undefined) continue;
          const at = path ? `state.${path}` : "the state";
          const read = (s: unknown) =>
            path ? path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], s) : s;
          throw new Error(
            `the two runs diverged at tick ${a[i]?.tick}: ${at} was ${show(read(a[i]?.state))} in the first run and ${show(read(b[i]?.state))} in the second. ` +
              "Look for Math.random(), Date.now() or real-time timers in game logic: use a seeded generator and the time step your loop passes in.",
          );
        }
        if (a.length !== b.length) throw new Error(`the script played ${a.length} steps the first time and ${b.length} the second`);
        if (!a.length) throw new Error("the script didn't play any steps, so there was nothing to compare");
      },
      "run",
      options,
    );
  },
});

/**
 * Group related tests under a name. Groups nest, and `describe.only` / `describe.skip` apply to every test inside.
 */
export const describe: ((name: string, fn: () => void) => void) & {
  only(name: string, fn: () => void): void;
  skip(name: string, fn: () => void): void;
} = Object.assign((name: string, fn: () => void) => group(name, fn, "run"), {
  only: (name: string, fn: () => void) => group(name, fn, "only"),
  skip: (name: string, fn: () => void) => group(name, fn, "skip"),
});

function group(name: string, fn: () => void, mode: TestCase["mode"]): void {
  const r = registry();
  r.suites.push({ name, mode });
  try {
    const result = fn() as unknown;
    if (result instanceof Promise) throw new TypeError(`describe("${name}") must be synchronous; put async work inside test()`);
  } finally {
    r.suites.pop();
  }
}

/**
 * Boot the project's game for this test: the real code `index.html` loads, in a fresh headless page,
 * paused until the test plays it. Calling `play()` again in the same test replaces the previous game.
 *
 * debuff games are driven through their dev tools (`devTools({ input })` inside `if (import.meta.env.DEV)`,
 * as every template has). Other games run on keiko's virtual clock and can expose state and shortcuts
 * as `window.__KEIKO__` (see {@link KeikoHooks}).
 *
 * ```ts
 * const game = await play<{ player: { x: number; onGround: boolean } }>();
 * const title = await play({ page: "title.html", ready: (g) => g.scene === "menu" });
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped tests read any state shape; pass S for checking.
export function play<S = any>(options: PlayOptions = {}): Promise<Playtest<S>> {
  return bootGame(options, {}) as Promise<Playtest<S>>;
}

async function bootGame(options: PlayOptions, hooks: { onStep?: (state: unknown, tick: number) => void }): Promise<Playtest> {
  const r = registry();
  if (!r.booter) throw new Error("play() only works inside tests run by `npx keiko` (or `npx debuff test`).");
  const game = await r.booter.boot(options, hooks);
  r.current = game;
  return game;
}

function combinations(grid: Record<string, readonly ParamValue[]>): Record<string, ParamValue>[] {
  let out: Record<string, ParamValue>[] = [{}];
  for (const [key, values] of Object.entries(grid)) {
    if (!values.length) throw new TypeError(`test.sweep: "${key}" has no values to try`);
    out = out.flatMap((combo) => values.map((v) => ({ ...combo, [key]: v })));
  }
  return out;
}

declare global {
  interface Window {
    /** Hooks for keiko tests: state to read, and optional input, params and commands. See {@link KeikoHooks}. */
    __KEIKO__?: KeikoHooks;
  }
}
