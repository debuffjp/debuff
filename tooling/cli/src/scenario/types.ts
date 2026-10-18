import type { ToolingPlugin } from "../plugin.js";

/**
 * A scenario is a JSON file of steps. Time only advances through `wait`, so runs are
 * deterministic. Validate with the JSON Schema in `@debuffjp/cli/schema/scenario.schema.json`.
 */
export interface Scenario {
  $schema?: string;
  /** Defaults to the file name. */
  name?: string;
  /** Path to open on the dev server. Default "/". */
  page?: string;
  /** Run with the browser asking for reduced motion (`prefers-reduced-motion: reduce`). */
  reducedMotion?: boolean;
  steps: Step[];
}

/** All given conditions must hold. */
export interface Comparison {
  eq?: unknown;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  /** `[target, tolerance]` */
  approx?: [number, number];
}

export type Step =
  /** Advance N fixed simulation steps. */
  | { wait: number }
  /** Hold a key (`KeyboardEvent.code`). */
  | { press: string }
  | { release: string }
  /** Press and release the pointer at logical coordinates over one step. */
  | { tap: [number, number] }
  | { pointerDown: [number, number] }
  | { pointerMove: [number, number] }
  | { pointerUp: true }
  /** Set params: `{ "player.speed": 300 }` sets group "player", key "speed". */
  | { set: Record<string, number | boolean> }
  /** Run a command the game registered with `devTools({ commands })`. */
  | { command: string; args?: unknown[] }
  /** Assert on dev state paths: "scene", "tick", "state.score", "stats.fps", "events.coin" (times `game.emit("coin")` ran). */
  | { expect: Record<string, Comparison> }
  /**
   * Advance one step at a time until every condition holds, failing if they don't within `within` steps
   * (default 600, ten seconds at 60 Hz). Same paths as `expect`: `{ "until": { "events.coin": { "gte": 1 } }, "within": 120 }`.
   */
  | { until: Record<string, Comparison>; within?: number }
  /**
   * Play this many steps and fail if the screen flashes in a way that could trigger photosensitive seizures:
   * more than three flashes a second over a quarter of a 10° field (an approximation of WCAG 2.3.1).
   */
  | { flashes: number }
  /** Fail if the light and dark parts of a region (`[x, y, w, h]`, logical units) contrast less than `min` (default 4.5, WCAG AA text). */
  | { contrast: [number, number, number, number]; min?: number }
  /** Screenshot compared against the per-platform baseline. */
  | { capture: string; tolerance?: number }
  /** Plugin step: `{ "<plugin>:<step>": value }`. */
  | { [pluginStep: `${string}:${string}`]: unknown };

export interface StepResult {
  index: number;
  step: Step;
  ok: boolean;
  message?: string;
}

export interface CaptureResult {
  name: string;
  path: string;
  baseline: string;
  /** `new`: no baseline existed and one was written. `missing`: no baseline and `--strict`. */
  status: "new" | "match" | "diff" | "updated" | "missing";
  diffRatio?: number;
  /** Image highlighting the differing pixels, written when `status` is `diff` and sizes match. */
  diff?: string;
}

export interface ScenarioReport {
  name: string;
  ok: boolean;
  steps: StepResult[];
  errors: string[];
  captures: CaptureResult[];
  finalState: unknown;
  durationMs: number;
}

export interface RunOptions {
  /** Tooling plugins whose `scenarioSteps` should be available. */
  plugins?: ToolingPlugin[];
  root: string;
  /** Scenario files relative to root. Default: every `scenarios/*.json`. */
  files: string[];
  /** Overwrite baselines with new captures. */
  update: boolean;
  /** Fail when a baseline is missing instead of recording it. */
  strict: boolean;
}
