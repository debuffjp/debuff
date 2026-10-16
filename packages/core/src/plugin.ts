import type { Game } from "./game.js";

/**
 * A runtime plugin extends a `Game` through its public API (hooks, params, inspect, scenes).
 *
 * ```ts
 * export function debugGrid(options: { size?: number } = {}): Plugin {
 *   return {
 *     name: "debug-grid",
 *     install(game) {
 *       const params = game.params.define("debug-grid", { size: { type: "number", default: options.size ?? 16, min: 4, max: 128 } });
 *       return game.hooks.afterRender((ctx) => drawGrid(ctx, params.values.size));
 *     },
 *   };
 * }
 *
 * game.use(debugGrid());
 * ```
 */
export interface Plugin {
  /** Unique kebab-case id. Also the conventional namespace for the plugin's params and inspect data. */
  readonly name: string;
  /** Called once by `game.use()`. Return a cleanup function to run on `game.dispose()`. */
  install(game: Game): (() => void) | undefined;
}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** @internal Tracks installed plugins for a Game. */
export class PluginRegistry {
  private readonly installed = new Map<string, (() => void) | undefined>();

  get names(): string[] {
    return [...this.installed.keys()];
  }

  has(name: string): boolean {
    return this.installed.has(name);
  }

  install(game: Game, plugin: Plugin): void {
    if (!NAME.test(plugin.name)) throw new Error(`Plugin name "${plugin.name}" must be kebab-case, e.g. "my-plugin"`);
    if (this.installed.has(plugin.name)) throw new Error(`Plugin "${plugin.name}" is already installed`);
    // Reserve the name first so a plugin that installs others can't recurse into itself.
    this.installed.set(plugin.name, undefined);
    try {
      const cleanup = plugin.install(game);
      this.installed.set(plugin.name, typeof cleanup === "function" ? cleanup : undefined);
    } catch (err) {
      this.installed.delete(plugin.name);
      throw new Error(`Plugin "${plugin.name}" failed to install: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }

  /** Run cleanups in reverse install order. */
  dispose(): void {
    for (const cleanup of [...this.installed.values()].reverse()) cleanup?.();
    this.installed.clear();
  }
}
