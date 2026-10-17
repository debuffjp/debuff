import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Driver, MissingHookError, type ParamValue } from "./driver.js";
import { type Duration, describeSteps, toSteps } from "./duration.js";
import { Trace } from "./trace.js";
import { pick, show } from "./values.js";

export type { ParamValue } from "./driver.js";

/**
 * A runtime error thrown by the game while a test was playing it, with where and when it happened.
 * The original error is the `cause`; its stack is kept, source-mapped to your TypeScript.
 */
export class GameError extends Error {
  override readonly name = "GameError";
  constructor(
    readonly error: unknown,
    /** The step that was being played when the game threw. */
    readonly tick: number,
    readonly scene: string | undefined,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    super(`the game threw at tick ${tick}${scene ? ` in scene "${scene}"` : ""}: ${message}`, { cause: error });
    if (error instanceof Error && error.stack) this.stack = `${this.name}: ${this.message}\n${error.stack.split("\n").slice(1).join("\n")}`;
  }
}

/** Thrown by {@link Playtest.until} when the condition doesn't hold in time. */
export class TimeoutError extends Error {
  override readonly name = "TimeoutError";
}

/** Thrown by {@link Playtest.during} when the invariant breaks. */
export class InvariantError extends Error {
  override readonly name = "InvariantError";
}

/** A condition on the game, checked once per step. Receives the scene's `inspect()` state and the playtest. */
export type Condition<S> = (state: S, game: Playtest<S>) => boolean;

/** A scenario object, or the path of a scenario, overlay replay or fuzz finding (`.json`). */
export type ScenarioSource = string | { steps: readonly Record<string, unknown>[] };

/** @internal Options the runner passes when it boots a game. */
export interface PlaytestInit {
  /** The game's page. */
  window?: Window;
  /** Called with a JSON copy of the scene state after every step (determinism checks). */
  onStep?: (state: unknown, tick: number) => void;
  /** Waits (real time) for the page's in-flight requests to finish. */
  settle?: (timeout?: number) => Promise<boolean>;
  /** Resolves relative scenario paths. */
  root: string;
}

/**
 * The game under test, paused at tick 0 and driven entirely by your test. Get one from {@link play}.
 *
 * Nothing moves unless you say so: input is applied on the next step, and time only advances through
 * `wait`, `hold`, `tap`, `until`, `during`, `trace` and `replay`. Every method that plays returns the
 * playtest, so short scripts read as one line:
 *
 * ```ts
 * const game = await play();
 * game.press("ArrowRight").wait("0.5s").release("ArrowRight");
 * expect(game.state.player.x).toBeAbove(200);
 * ```
 *
 * `S` is the shape of the game's state snapshot: `play<{ player: { x: number } }>()`.
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped tests read any state shape; pass S for checking.
export class Playtest<S = any> {
  /** Seconds per simulation step (a frame of the virtual clock, or the game's own fixed step). */
  readonly stepSeconds: number;
  /** The game's page, for reading anything the game keeps in globals or the DOM. */
  readonly window: Window;
  private readonly onStep: ((state: unknown, tick: number) => void) | undefined;
  private readonly root: string;
  private readonly settler: ((timeout?: number) => Promise<boolean>) | undefined;

  /** @internal Use {@link play}. */
  constructor(
    /** How keiko drives this game: debuff's dev hooks, the game's `window.__KEIKO__`, or the virtual clock. */
    readonly driver: Driver,
    init: PlaytestInit,
  ) {
    this.stepSeconds = driver.stepSeconds;
    this.window = init.window ?? (globalThis as unknown as Window);
    this.onStep = init.onStep;
    this.root = init.root;
    this.settler = init.settle;
  }

  // ---- reading ---------------------------------------------------------------------------------

  /** The game's state snapshot (debuff: the scene's `inspect()`; others: `__KEIKO__.state()`), read fresh on every access. */
  get state(): S {
    return this.driver.state() as S;
  }

  /** The active scene's name, if the game reports one. */
  get scene(): string | undefined {
    return this.driver.scene();
  }

  /** Steps played since the game booted. */
  get tick(): number {
    return this.driver.tick();
  }

  /** Simulated seconds since the game booted. */
  get time(): number {
    return this.driver.time();
  }

  /**
   * Read any path of everything the driver reports: `"scene"`, `"tick"`, `"state.player.x"`, and for debuff
   * games the rest of its dev state (`"plugins.tweens.active"`). For the game's state, `game.state.player.x` is shorter.
   */
  get(path: string): unknown {
    return pick(this.driver.snapshot(), path);
  }

  /** Every param, by group: `{ player: { speed: 140, gravity: 900 } }`. */
  params(): Record<string, Record<string, ParamValue>> {
    return this.driver.params();
  }

  /** The current value of one param, by `"group.key"`: `game.param("player.accel")`. */
  param(path: string): ParamValue {
    const dot = path.indexOf(".");
    const all = this.driver.params();
    const value = dot > 0 ? all[path.slice(0, dot)]?.[path.slice(dot + 1)] : undefined;
    if (value === undefined) {
      const known = Object.entries(all).flatMap(([g, values]) => Object.keys(values).map((k) => `${g}.${k}`));
      throw new RangeError(`No param "${path}". This game has: ${known.join(", ") || "none"}`);
    }
    return value;
  }

  // ---- time ------------------------------------------------------------------------------------

  /** Play for a while with the current input. `wait()` plays one step. */
  wait(duration: Duration = 1): this {
    this.advance(toSteps(duration, this.stepSeconds));
    return this;
  }

  /**
   * Play until `condition` holds, and return how many steps that took (0 if it already held).
   * Throws a {@link TimeoutError}, with the last state, if it doesn't hold within `within` (default 10 seconds).
   *
   * This is how to assert on feel: not "where is the player after 15 steps" but "how quickly does it get there".
   *
   * ```ts
   * game.press("ArrowRight");
   * const steps = game.until((s) => s.player.vx >= 140, { within: "0.5s" });
   * expect(steps).toBeAtMost(15); // top speed within a quarter second
   * ```
   */
  until(condition: Condition<S>, options: { within?: Duration; message?: string } = {}): number {
    const limit = toSteps(options.within ?? "10s", this.stepSeconds);
    for (let steps = 0; ; steps++) {
      if (condition(this.state, this)) return steps;
      if (steps >= limit) {
        const what = options.message ?? (condition.toString().length < 120 ? condition.toString() : "the condition");
        throw new TimeoutError(
          `${what} didn't hold within ${describeSteps(limit, this.stepSeconds)}. Last state: ${show(this.state, 400)}`,
        );
      }
      this.advance(1);
    }
  }

  /**
   * Play for a while, checking an invariant after every step. The check fails by returning `false`
   * or by throwing (so `expect` works inside it). The error names the step where it broke.
   *
   * ```ts
   * game.hold("ArrowLeft", "3s");                                   // run into the wall…
   * game.during("2s", (s) => s.player.x >= 8);                       // …and never pass through it
   * game.during("5s", (s) => { expect(s.lives).toBeAtLeast(0); });   // or assert inside
   * ```
   */
  during(duration: Duration, check: (state: S, game: Playtest<S>) => unknown, message?: string): this {
    const steps = toSteps(duration, this.stepSeconds);
    for (let i = 0; i < steps; i++) {
      this.advance(1);
      let ok: unknown;
      try {
        ok = check(this.state, this);
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        throw new InvariantError(`${message ?? "invariant"} broke after ${describeSteps(i + 1, this.stepSeconds)}: ${why}`, { cause: err });
      }
      if (ok === false) {
        throw new InvariantError(
          `${message ?? "invariant"} broke after ${describeSteps(i + 1, this.stepSeconds)} (tick ${this.tick}). State: ${show(this.state, 400)}`,
        );
      }
    }
    return this;
  }

  /**
   * Play for a while and record a value after every step: a path into the scene state (`"player.y"`)
   * or a function of it. A path traces numbers unless you say otherwise: `trace<boolean>("player.onGround", "1s")`.
   * See {@link Trace} for what you can ask of the result.
   */
  trace<T = number>(what: string | ((state: S) => T), duration: Duration): Trace<T> {
    const read = typeof what === "string" ? (s: S) => pick(s, what) as T : what;
    const label = typeof what === "string" ? what : "the traced value";
    const start = read(this.state);
    const values: T[] = [];
    const steps = toSteps(duration, this.stepSeconds);
    for (let i = 0; i < steps; i++) {
      this.advance(1);
      values.push(read(this.state));
    }
    return new Trace(values, start, label, this.stepSeconds);
  }

  /**
   * Wait, in real time, for the game's network work to finish: fetches and image loads it started, and
   * the promise callbacks that follow. Game time doesn't move. `play()` already does this once at boot;
   * call it after something that loads lazily (a new level's assets, a sound on first use).
   *
   * ```ts
   * game.command("load-level", 2);
   * await game.settle();
   * game.wait("1s");
   * ```
   *
   * Throws if requests are still in flight after `timeout` ms (default 10 000).
   */
  async settle(timeout = 10_000): Promise<this> {
    if (this.settler && !(await this.settler(timeout))) {
      throw new Error(`settle(): the game still had requests in flight after ${timeout} ms`);
    }
    return this;
  }

  // ---- input -----------------------------------------------------------------------------------

  /** Hold a key down (`KeyboardEvent.code`: `"ArrowLeft"`, `"KeyZ"`, `"Space"`). It takes effect on the next step. */
  press(code: string): this {
    this.driver.press(code);
    return this;
  }

  /** Let go of a key. */
  release(code: string): this {
    this.driver.release(code);
    return this;
  }

  /** Hold a key for a while, then release it. */
  hold(code: string, duration: Duration): this {
    this.press(code).wait(duration);
    return this.release(code);
  }

  /**
   * A quick press: `tap("Space")` presses a key for one step and releases it; `tap(x, y)` presses
   * and releases the pointer at logical coordinates. Either way, one step is played.
   */
  tap(code: string): this;
  tap(x: number, y: number): this;
  tap(a: string | number, y?: number): this {
    if (typeof a === "string") return this.press(a).wait(1).release(a);
    this.guard(() => this.driver.tap(a, y ?? 0));
    this.notify();
    return this;
  }

  /** Press the pointer (mouse or touch) at logical coordinates and keep it down. */
  pointerDown(x: number, y: number): this {
    this.driver.pointerDown(x, y);
    return this;
  }

  /** Move the pointer, pressed or not. */
  pointerMove(x: number, y: number): this {
    this.driver.pointerMove(x, y);
    return this;
  }

  /** Release the pointer. */
  pointerUp(): this {
    this.driver.pointerUp();
    return this;
  }

  // ---- params and commands ---------------------------------------------------------------------

  /**
   * Set tunable params by `"group.key"`, one or many. The game validates them: debuff checks each
   * param's type and range, exactly as its dev overlay and agents do.
   *
   * ```ts
   * game.set("player.jumpSpeed", 320);
   * game.set({ "player.gravity": 1200, "player.coyote": 0 });
   * ```
   */
  set(path: string, value: ParamValue): this;
  set(values: Record<string, ParamValue>): this;
  set(a: string | Record<string, ParamValue>, value?: ParamValue): this {
    const entries = typeof a === "string" ? [[a, value] as const] : Object.entries(a);
    for (const [path, v] of entries) {
      const dot = path.indexOf(".");
      if (dot < 1) throw new TypeError(`Param "${path}" must be written "group.key", e.g. "player.speed"`);
      if (v === undefined) throw new TypeError(`No value given for param "${path}"`);
      this.driver.setParam(path.slice(0, dot), path.slice(dot + 1), v);
    }
    return this;
  }

  /**
   * Run a command the game registered with `devTools({ commands })`, such as warping to a checkpoint.
   * Returns whatever the command returns.
   */
  command(name: string, ...args: unknown[]): unknown {
    return this.guard(() => this.driver.command(name, ...args));
  }

  // ---- scenarios and replays -------------------------------------------------------------------

  /**
   * Play a scenario's steps: a scenario file, an overlay replay, a fuzz finding (`.debuff/fuzz/*.json`),
   * or a scenario object. `expect` steps are checked, except on `renderer` and `stats.*`, which describe the
   * browser; `capture` steps are skipped, since nothing is drawn here.
   * The usual next step is to assert on the state the replay left behind:
   *
   * ```ts
   * game.replay(".debuff/replays/replay-tick-412.json");
   * expect(game.state.player.vx).toBeCloseTo(0, 1);
   * ```
   */
  replay(source: ScenarioSource): this {
    const scenario =
      typeof source === "string"
        ? (JSON.parse(readFileSync(resolve(this.root, source), "utf8")) as { steps: Record<string, unknown>[] })
        : source;
    if (!Array.isArray(scenario?.steps)) throw new TypeError("A scenario needs a `steps` array");
    for (const [i, step] of scenario.steps.entries()) {
      try {
        this.runStep(step);
      } catch (err) {
        if (err instanceof GameError) throw err;
        const why = err instanceof Error ? err.message : String(err);
        throw new Error(`replay step ${i} ${show(step)} failed: ${why}`, { cause: err });
      }
    }
    return this;
  }

  // ---- internals -------------------------------------------------------------------------------

  private runStep(step: Record<string, unknown>): void {
    const [key = "", value] = Object.entries(step)[0] ?? [];
    const pair = (v: unknown) => v as [number, number];
    switch (key) {
      case "wait":
        this.wait(value as number);
        break;
      case "press":
        this.press(value as string);
        break;
      case "release":
        this.release(value as string);
        break;
      case "tap":
        this.tap(...pair(value));
        break;
      case "pointerDown":
        this.pointerDown(...pair(value));
        break;
      case "pointerMove":
        this.pointerMove(...pair(value));
        break;
      case "pointerUp":
        this.pointerUp();
        break;
      case "set":
        this.set(value as Record<string, ParamValue>);
        break;
      case "command":
        this.command(value as string, ...(((step as { args?: unknown[] }).args ?? []) as unknown[]));
        break;
      case "expect":
        for (const [path, cmp] of Object.entries(value as Record<string, Comparison>)) {
          // Headless games always render with the inert 2D backend and have no real frame timings.
          if (path === "renderer" || path.startsWith("stats.")) continue;
          const failure = compare(this.get(path), cmp);
          if (failure) throw new Error(`${path}: ${failure}`);
        }
        break;
      case "capture":
        break; // Nothing is rendered headless; captures belong to `debuff scenario`.
      default:
        throw new Error(key.includes(":") ? `plugin step "${key}" only runs under \`debuff scenario\`` : `unknown step ${show(step)}`);
    }
  }

  /** Advance `steps` steps, one at a time when something watches every step. */
  private advance(steps: number): void {
    if (steps <= 0) return;
    if (!this.onStep) {
      this.guard(() => this.driver.step(steps));
      return;
    }
    for (let i = 0; i < steps; i++) {
      this.guard(() => this.driver.step(1));
      this.notify();
    }
  }

  private notify(): void {
    if (!this.onStep) return;
    this.onStep(JSON.parse(JSON.stringify(this.driver.state() ?? null)), this.driver.tick());
  }

  /** Run something that may step the game, turning a game crash into a {@link GameError}. */
  private guard<R>(fn: () => R): R {
    try {
      return fn();
    } catch (err) {
      if (err instanceof GameError || err instanceof MissingHookError) throw err;
      // The clock counts a step only once it completes, so the step that threw is the next one.
      let at: { tick: number; scene: string | undefined } = { tick: Number.NaN, scene: undefined };
      try {
        at = { tick: this.driver.tick(), scene: this.driver.scene() };
      } catch {
        // The game is too broken to report its state; the error itself still says what happened.
      }
      throw new GameError(err, at.tick + 1, at.scene);
    }
  }
}

/** A scenario `expect` comparison. All given conditions must hold. */
interface Comparison {
  eq?: unknown;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  approx?: [number, number];
}

function compare(actual: unknown, c: Comparison): string | undefined {
  if ("eq" in c && JSON.stringify(actual) !== JSON.stringify(c.eq)) return `expected ${show(c.eq)}, got ${show(actual)}`;
  const numeric = c.gt !== undefined || c.gte !== undefined || c.lt !== undefined || c.lte !== undefined || c.approx;
  if (!numeric) return undefined;
  if (typeof actual !== "number") return `expected a number, got ${show(actual)}`;
  if (c.gt !== undefined && !(actual > c.gt)) return `expected > ${c.gt}, got ${actual}`;
  if (c.gte !== undefined && !(actual >= c.gte)) return `expected >= ${c.gte}, got ${actual}`;
  if (c.lt !== undefined && !(actual < c.lt)) return `expected < ${c.lt}, got ${actual}`;
  if (c.lte !== undefined && !(actual <= c.lte)) return `expected <= ${c.lte}, got ${actual}`;
  if (c.approx && !(Math.abs(actual - c.approx[0]) <= c.approx[1])) return `expected ${c.approx[0]} ± ${c.approx[1]}, got ${actual}`;
  return undefined;
}
