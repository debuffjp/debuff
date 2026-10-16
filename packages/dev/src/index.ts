import type { Game, ParamDescription, ParamValue } from "@debuff/core";

/** The parts of `@debuff/input`'s `Input` the hooks drive. Structural, so `dev` does not depend on `input`. */
export interface DrivableInput {
  keys: { press(code: string): void; release(code: string): void };
  pointer: { press(x: number, y: number): void; move(x: number, y: number): void; release(): void };
}

export interface DevState {
  scene: string | undefined;
  tick: number;
  time: number;
  frozen: boolean;
  stats: ReturnType<Game["stats"]["summary"]>;
  /** Whatever the active scene's `inspect()` returns. */
  state: unknown;
}

/**
 * The dev inspection and control surface, available as `window.__DEBUFF_DEV__` in dev builds.
 * Every method takes and returns JSON-serialisable values so browsers, CLIs and agents can call it.
 */
export interface DevHooks {
  readonly version: 1;
  /** True when the page was opened with `?debuff-scenario`: the loop is stopped and time only advances via `step`. */
  readonly controlled: boolean;
  /** Advance `steps` fixed simulation steps and return the new state. */
  step(steps?: number): DevState;
  state(): DevState;
  press(code: string): void;
  release(code: string): void;
  /** Press and release the primary pointer at logical coordinates across one step. */
  tap(x: number, y: number): void;
  pointerDown(x: number, y: number): void;
  pointerMove(x: number, y: number): void;
  pointerUp(): void;
  params(): Record<string, ParamDescription>;
  setParam(group: string, key: string, value: ParamValue): void;
  /** Uncaught errors and unhandled rejections since load. */
  errors(): string[];
  /** PNG data URL of the current frame. */
  capture(): string;
}

declare global {
  interface Window {
    __DEBUFF_DEV__?: DevHooks;
  }
}

export interface DevHooksOptions {
  input?: DrivableInput;
}

/**
 * Install `window.__DEBUFF_DEV__`. Call inside `if (import.meta.env.DEV)` so bundlers drop it
 * from production; `debuff build` fails if it leaks.
 */
export function exposeDevHooks(game: Game, options: DevHooksOptions = {}): DevHooks {
  const errors: string[] = [];
  addEventListener("error", (e) => errors.push(String(e.error?.stack ?? e.message)));
  addEventListener("unhandledrejection", (e) => errors.push(String(e.reason?.stack ?? e.reason)));

  const controlled = new URLSearchParams(location.search).has("debuff-scenario");
  if (controlled) {
    game.pauseWhenHidden = false;
    game.stop();
  }

  const input = (): DrivableInput => {
    if (!options.input) throw new Error("exposeDevHooks: pass { input } to drive input");
    return options.input;
  };

  const state = (): DevState => ({
    scene: game.scene?.id,
    tick: game.clock.tick,
    time: game.clock.time,
    frozen: game.frozen,
    stats: game.stats.summary(),
    state: game.scene?.inspect?.(),
  });

  const hooks: DevHooks = {
    version: 1,
    controlled,
    step(steps = 1) {
      game.step(steps);
      return state();
    },
    state,
    press: (code) => input().keys.press(code),
    release: (code) => input().keys.release(code),
    tap(x, y) {
      input().pointer.press(x, y);
      game.step(1);
      input().pointer.release();
    },
    pointerDown: (x, y) => input().pointer.press(x, y),
    pointerMove: (x, y) => input().pointer.move(x, y),
    pointerUp: () => input().pointer.release(),
    params: () => game.params.describe(),
    setParam(group, key, value) {
      const g = game.params.group(group);
      if (!g) throw new Error(`Unknown param group "${group}". Known: ${Object.keys(game.params.describe()).join(", ")}`);
      g.set(key, value);
    },
    errors: () => [...errors],
    capture: () => game.canvas.toDataURL("image/png"),
  };
  window.__DEBUFF_DEV__ = hooks;
  return hooks;
}
