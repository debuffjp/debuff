import type { Draw } from "./render/draw.js";
import type { Scene } from "./scene.js";

export type Unsubscribe = () => void;

/** Payloads for each lifecycle hook. */
export interface HookArgs {
  beforeUpdate: [dt: number];
  afterUpdate: [dt: number];
  beforeRender: [draw: Draw, alpha: number];
  afterRender: [draw: Draw, alpha: number];
  sceneChange: [next: Scene, previous: Scene | undefined];
  /** The loop stopped because game code threw. The error is also rethrown so the console still shows it. */
  error: [error: unknown, context: GameErrorContext];
  /** Something meaningful happened in the game (`game.emit`). */
  gameEvent: [name: string, detail: unknown];
}

/** Where a loop error happened. */
export interface GameErrorContext {
  /** The part of the frame that threw: `"update"`, `"render"` or a hook such as `"beforeUpdate"`. */
  phase: string;
  scene: string | undefined;
  tick: number;
}

export type HookName = keyof HookArgs;

/**
 * Typed lifecycle hooks on `game.hooks`. Each method registers a listener and returns an unsubscribe function.
 *
 * Order within a step: `beforeUpdate` → camera → `scene.update` → `afterUpdate`.
 * Order within a frame: clear → `beforeRender` → `scene.render` → `afterRender`.
 * `beforeRender`/`afterRender` draw in logical units; `afterRender` starts from a clean transform.
 * Steps skipped by `freeze()` fire no update hooks.
 */
export class Hooks {
  private readonly listeners: { [K in HookName]: Set<(...args: HookArgs[K]) => void> } = {
    beforeUpdate: new Set(),
    afterUpdate: new Set(),
    beforeRender: new Set(),
    afterRender: new Set(),
    sceneChange: new Set(),
    error: new Set(),
    gameEvent: new Set(),
  };

  beforeUpdate(fn: (dt: number) => void): Unsubscribe {
    return this.on("beforeUpdate", fn);
  }

  afterUpdate(fn: (dt: number) => void): Unsubscribe {
    return this.on("afterUpdate", fn);
  }

  beforeRender(fn: (draw: Draw, alpha: number) => void): Unsubscribe {
    return this.on("beforeRender", fn);
  }

  afterRender(fn: (draw: Draw, alpha: number) => void): Unsubscribe {
    return this.on("afterRender", fn);
  }

  sceneChange(fn: (next: Scene, previous: Scene | undefined) => void): Unsubscribe {
    return this.on("sceneChange", fn);
  }

  /** The game loop stopped on an error (see `game.lastError`). */
  error(fn: (error: unknown, context: GameErrorContext) => void): Unsubscribe {
    return this.on("error", fn);
  }

  /** The game called `game.emit(name, detail)`. */
  gameEvent(fn: (name: string, detail: unknown) => void): Unsubscribe {
    return this.on("gameEvent", fn);
  }

  /** Number of listeners per hook, for inspection. */
  counts(): Record<HookName, number> {
    const out = {} as Record<HookName, number>;
    for (const name of Object.keys(this.listeners) as HookName[]) out[name] = this.listeners[name].size;
    return out;
  }

  /** @internal Called by `Game`. */
  emit<K extends HookName>(name: K, ...args: HookArgs[K]): void {
    for (const fn of this.listeners[name]) fn(...args);
  }

  private on<K extends HookName>(name: K, fn: (...args: HookArgs[K]) => void): Unsubscribe {
    const set = this.listeners[name];
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }
}
