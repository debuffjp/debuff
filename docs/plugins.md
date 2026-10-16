# Writing plugins

Plugins extend debuff through small, typed contracts ([ADR 0004](./adr/0004-plugin-api.md)). This guide covers **runtime plugins**, which run in the browser. Tooling plugins (asset importers, CLI commands, scenario steps) come in phase 2.

## The contract

```ts
import type { Plugin } from "@debuff/core";

interface Plugin {
  readonly name: string; // unique, kebab-case
  install(game: Game): (() => void) | undefined; // optional cleanup, run on game.dispose()
}
```

Install with `game.use(plugin)`. It returns the game, so calls chain. A plugin may only touch `Game`'s public API:

| Use | For |
| --- | --- |
| `game.hooks.beforeUpdate / afterUpdate(fn(dt))` | simulation work around the scene's update |
| `game.hooks.beforeRender / afterRender(fn(ctx, alpha))` | drawing under or over the scene. `afterRender` is in logical units, outside the camera |
| `game.hooks.sceneChange(fn(next, previous))` | reacting to scene switches |
| `game.params.define("<name>", schema)` | tunable settings, visible to tools and agents |
| `game.inspect.register("<name>", () => json)` | state for dev tools and scenarios (`__DEBUFF_DEV__.state().plugins.<name>`) |
| `game.camera`, `game.random`, `game.clock`, `game.stats` | shared services. Use `game.random` for anything that affects gameplay or visuals, so runs stay deterministic |

Every hook registration returns an unsubscribe function. Return a cleanup that calls them all.

## Example

```ts
import type { Plugin } from "@debuff/core";

export interface DebugGridOptions {
  size?: number;
  color?: string;
}

export function debugGrid(options: DebugGridOptions = {}): Plugin {
  return {
    name: "debug-grid",
    install(game) {
      const params = game.params.define("debug-grid", {
        size: { type: "number", default: options.size ?? 16, min: 4, max: 128, units: "px" },
        visible: { type: "boolean", default: true },
      });
      let lines = 0;
      const offRender = game.hooks.afterRender((draw) => {
        if (!params.values.visible) return;
        lines = 0;
        for (let x = 0; x <= game.width; x += params.values.size, lines++) draw.line(x, 0, x, game.height, 1, options.color ?? "#ffffff1a");
      });
      const offInspect = game.inspect.register("debug-grid", () => ({ lines }));
      return () => {
        offRender();
        offInspect();
      };
    },
  };
}
```

## Rules

1. **Name everything after the plugin.** Use the same id for the plugin, its param group and its inspect provider.
2. **Clean up fully.** After `game.dispose()` nothing of yours should still be listening or attached to the DOM.
3. **No global state, no monkey-patching.** Don't modify `Game` or other plugins.
4. **Dev-only code** stays behind `import.meta.env.DEV`. `debuff build` fails if it leaks.
5. **Pay for what you use.** Ship ESM with `"sideEffects": false` and no work at import time.
6. **Factories take options.** Export `myPlugin(options): Plugin`, not a pre-built object, so games can configure it.

## Publishing

- Name: `debuff-plugin-<name>` (or `@scope/debuff-plugin-<name>`). First-party plugins use `@debuff/plugin-<name>`.
- Add the `debuff-plugin` keyword, and `@debuff/core` as a peer dependency.
- Expose browser code at `"."`. Tooling code (phase 2) will go at `"./tooling"`.

## Reference implementation

`@debuff/dev` ships as the `dev-tools` plugin (`game.use(devTools({ input }))`). Read its source for a complete example with cleanup.
