import type { Game, ParamDescription, ParamValue, Plugin } from "@debuff/core";

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
  /** Installed plugin names, in install order. */
  pluginNames: readonly string[];
  /** Snapshots from `game.inspect` providers, keyed by name. */
  plugins: Record<string, unknown>;
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
 * The dev tools as a runtime plugin. Installs `window.__DEBUFF_DEV__` and removes it on `game.dispose()`.
 * Use inside `if (import.meta.env.DEV)` so bundlers drop it; `debuff build` fails if it leaks.
 */
export function devTools(options: DevHooksOptions = {}): Plugin {
  return {
    name: "dev-tools",
    install(game) {
      const errors: string[] = [];
      const onError = (e: ErrorEvent) => errors.push(String(e.error?.stack ?? e.message));
      const onRejection = (e: PromiseRejectionEvent) => errors.push(String(e.reason?.stack ?? e.reason));
      addEventListener("error", onError);
      addEventListener("unhandledrejection", onRejection);
      window.__DEBUFF_DEV__ = createHooks(game, options, errors);
      return () => {
        removeEventListener("error", onError);
        removeEventListener("unhandledrejection", onRejection);
        delete window.__DEBUFF_DEV__;
      };
    },
  };
}

/** Shorthand for `game.use(devTools(options))`; returns the installed hooks. */
export function exposeDevHooks(game: Game, options: DevHooksOptions = {}): DevHooks {
  game.use(devTools(options));
  if (!window.__DEBUFF_DEV__) throw new Error("dev-tools plugin did not install");
  return window.__DEBUFF_DEV__;
}

function createHooks(game: Game, options: DevHooksOptions, errors: string[]): DevHooks {
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
    pluginNames: game.plugins,
    plugins: game.inspect.snapshot(),
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
  return hooks;
}
