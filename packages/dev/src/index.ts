import type { Game, ParamValue } from "@debuff/core";

/** Anything with programmatic press/release, e.g. `Keyboard`. */
interface KeyInput {
  press(code: string): void;
  release(code: string): void;
}
/** Anything with programmatic pointer control, e.g. `Pointer`. */
interface PointerInput {
  press(x: number, y: number): void;
  move(x: number, y: number): void;
  release(): void;
}

export interface DevHooksOptions {
  keys?: KeyInput;
  pointer?: PointerInput;
}

export interface DevState {
  scene: string | undefined;
  tick: number;
  time: number;
  frozen: boolean;
  stats: ReturnType<Game["stats"]["summary"]>;
  state: unknown;
}

export interface DevHooks {
  readonly version: 1;
  readonly game: Game;
  /** True when loaded with `?debuff-scenario`: the loop is stopped and time advances only via `step`. */
  readonly controlled: boolean;
  step(steps?: number): DevState;
  state(): DevState;
  press(code: string): void;
  release(code: string): void;
  tap(x: number, y: number): void;
  pointerDown(x: number, y: number): void;
  pointerUp(): void;
  params(): ReturnType<Game["params"]["describe"]>;
  setParam(group: string, key: string, value: ParamValue): void;
  errors(): string[];
  capture(): string;
}

/** Expose a stable inspection/control surface on `window.__DEBUFF_DEV__`.
 *  Call only inside `if (import.meta.env.DEV)` so it is stripped from production. */
export function exposeDevHooks(game: Game, options: DevHooksOptions = {}): DevHooks {
  const errors: string[] = [];
  addEventListener("error", (e) => errors.push(String(e.error?.stack ?? e.message)));
  addEventListener("unhandledrejection", (e) => errors.push(String(e.reason?.stack ?? e.reason)));

  const controlled = new URLSearchParams(location.search).has("debuff-scenario");
  if (controlled) {
    game.pauseWhenHidden = false;
    game.stop();
  }

  const state = (): DevState => {
    const scene = game.scene as (typeof game.scene & { inspect?: () => unknown }) | undefined;
    return {
      scene: scene?.id,
      tick: game.clock.tick,
      time: game.clock.time,
      frozen: game.frozen,
      stats: game.stats.summary(),
      state: scene?.inspect?.(),
    };
  };
  const need = <T>(v: T | undefined, what: string): T => {
    if (!v) throw new Error(`exposeDevHooks: no ${what} provided`);
    return v;
  };

  const hooks: DevHooks = {
    version: 1,
    game,
    controlled,
    step(steps = 1) {
      game.step(steps);
      return state();
    },
    state,
    press: (code) => need(options.keys, "keys").press(code),
    release: (code) => need(options.keys, "keys").release(code),
    tap(x, y) {
      const p = need(options.pointer, "pointer");
      p.press(x, y);
      game.step(1);
      p.release();
    },
    pointerDown: (x, y) => need(options.pointer, "pointer").press(x, y),
    pointerUp: () => need(options.pointer, "pointer").release(),
    params: () => game.params.describe(),
    setParam(group, key, value) {
      const g = game.params.group(group);
      if (!g) throw new Error(`Unknown param group "${group}"`);
      g.set(key, value);
    },
    errors: () => [...errors],
    capture: () => game.canvas.toDataURL("image/png"),
  };
  (window as unknown as { __DEBUFF_DEV__: DevHooks }).__DEBUFF_DEV__ = hooks;
  return hooks;
}
