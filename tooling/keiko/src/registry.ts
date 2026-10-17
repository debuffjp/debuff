import type { ParamValue, Playtest } from "./playtest.js";

/** Options for {@link play}. */
export interface PlayOptions {
  /** Page to boot, relative to the project root: its module scripts are the game. Default `"index.html"`. */
  page?: string;
  /** Params to set before the first step, by `"group.key"`. */
  params?: Record<string, ParamValue>;
  /**
   * When the game counts as ready to test. Default: as soon as its modules have loaded (debuff games: once
   * their dev hooks are installed and a scene is active). Use this when the game loads assets or boots
   * over several frames first, e.g. `(g) => g.scene === "level-1"`.
   */
  ready?: (game: Playtest) => boolean;
  /** Milliseconds (real time) to wait for the game to become ready. Default 10 000. */
  timeout?: number;
  /** Seed for `Math.random()` while the game runs. Default 1, so every run sees the same numbers. */
  seed?: number;
  /** Frames per second of the virtual clock, for games that run on `requestAnimationFrame`. Default 60. */
  fps?: number;
  /** Offer WebGL. Set false to make engines fall back to Canvas 2D, as without a GPU. Default true (debuff games: false). */
  webgl?: boolean;
}

/** Options for one test. */
export interface TestOptions {
  /** Real-time limit in milliseconds. Default 30 000. */
  timeout?: number;
}

/** @internal How the runner boots a game for `play()`. */
export interface Booter {
  boot(options: PlayOptions, hooks: { onStep?: (state: unknown, tick: number) => void }): Promise<Playtest>;
}

/** @internal A registered test. */
export interface TestCase {
  file: string;
  /** Enclosing `describe` names, outermost first. */
  suites: string[];
  name: string;
  fn: () => unknown;
  mode: "run" | "only" | "skip" | "todo";
  timeout: number;
}

/** @internal `beforeEach` / `afterEach` functions registered in a file or `describe`. */
export interface Hooks {
  before: (() => unknown)[];
  after: (() => unknown)[];
}

/** @internal Shared between the runner and test files, even if they load separate copies of this package. */
export interface Registry {
  tests: TestCase[];
  file: string;
  /** Hooks declared at the top level of the current file. */
  fileHooks: Hooks;
  suites: { name: string; mode: TestCase["mode"]; hooks: Hooks }[];
  booter: Booter | undefined;
  /** The game the running test is playing, for failure context. */
  current: Playtest | undefined;
}

const KEY = Symbol.for("keiko.registry");

/** @internal */
export function registry(): Registry {
  const g = globalThis as { [KEY]?: Registry };
  g[KEY] ??= { tests: [], file: "", fileHooks: { before: [], after: [] }, suites: [], booter: undefined, current: undefined };
  return g[KEY];
}
