# Writing plugins

Plugins extend debuff through small, typed contracts ([ADR 0004](./adr/0004-plugin-api.md)). There are two kinds, and one package can ship both:

- **Runtime plugins** run in the browser and install with `game.use()`.
- **Tooling plugins** run in the CLI and go in `debuff.config.ts`. They add asset importers, CLI commands and scenario steps.

Browse official and community plugins in the [plugin hub](https://github.com/debuffjp/plugins), and list yours there once it's on npm.

## The contract

```ts
import type { Plugin } from "@debuffjp/core";

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
| `game.hooks.renderScene(fn(draw, render))` | post effects: draw the world through a target, `filter()` or shader. Call `render()` once. `afterRender` stays outside |
| `game.hooks.sceneChange(fn(next, previous))` | reacting to scene switches |
| `game.hooks.gameEvent(fn(name, detail))` | reacting to `game.emit`. An event emitted from a listener is delivered after the current one, so every listener sees the same order |
| `game.params.define("<name>", schema)` | tunable settings, visible to tools and agents |
| `game.inspect.register("<name>", () => json)` | state for dev tools and scenarios (`__DEBUFF_DEV__.state().plugins.<name>`) |
| `game.camera`, `game.random`, `game.clock`, `game.stats` | shared services. Use `game.random` for anything that affects gameplay or visuals, so runs stay deterministic |

Every hook registration returns an unsubscribe function. Return a cleanup that calls them all.

## Example

```ts
import type { Plugin } from "@debuffjp/core";

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

### Post effects

`renderScene` wraps `beforeRender` and the scene's render. This greys out the world while paused, and leaves HUD overlays drawn in `afterRender` untouched:

```ts
import { filter, grayscale } from "spryte";

const grey = [grayscale()];
const off = game.hooks.renderScene((draw, render) => filter(draw, grey, render));
```

Wrappers registered later wrap earlier ones. A wrapper that doesn't call `render()` hides the scene.

## Testing

`@debuffjp/core/testing` gives you a `Game` that runs under happy-dom or jsdom, with a no-op canvas. Hooks, scenes, params, inspect and plugins all work; time moves only when you call `game.step()`.

```ts
import { createTestGame } from "@debuffjp/core/testing";

const game = createTestGame();
game.use(debugGrid({ size: 32 }));
game.redraw();
expect(game.inspect.snapshot()["debug-grid"]).toEqual({ lines: 4 }); // x = 0, 32, 64, 96 on the default 100-wide game
```

## Rules

1. **Name everything after the plugin.** Use the same id for the plugin, its param group and its inspect provider.
2. **Clean up fully.** After `game.dispose()` nothing of yours should still be listening or attached to the DOM.
3. **No global state, no monkey-patching.** Don't modify `Game` or other plugins.
4. **Dev-only code** stays behind `import.meta.env.DEV`. `debuff build` fails if it leaks.
5. **Pay for what you use.** Ship ESM with `"sideEffects": false` and no work at import time.
6. **Factories take options.** Export `myPlugin(options): Plugin`, not a pre-built object, so games can configure it.

## Publishing

- Name: `debuff-plugin-<name>` (or `@scope/debuff-plugin-<name>`). First-party plugins use `@debuffjp/plugin-<name>`.
- Add the `debuff-plugin` keyword, and `@debuffjp/core` as a peer dependency.
- Expose browser code at `"."` and tooling code at `"./tooling"`, so bundles never pull in Node code.
- List it in the [plugin hub](https://github.com/debuffjp/plugins#add-your-plugin) with a pull request.

## Reference implementation

- Runtime: `@debuffjp/dev` ships as the `dev-tools` plugin (`game.use(devTools({ input }))`). The hub's [official plugins](https://github.com/debuffjp/plugins/tree/main/plugins) are smaller examples with tests.
- Tooling: the `aseprite()` importer in `@debuffjp/cli` ([source](../tooling/cli/src/assets/aseprite.ts)).

## Asset importers

An importer claims files by suffix and turns each one into manifest entries. Sources are never modified; generated files (atlases, transcoded audio) go in `outputs`.

```ts
import { defineConfig } from "@debuffjp/cli";

export default defineConfig({
  plugins: [
    {
      name: "levels",
      apiVersion: 1,
      assets: [
        {
          name: "level-txt",
          extensions: [".level.txt"],
          import: (file) => ({ assets: { [file.id]: { type: "text", src: `assets/${file.rel}` } } }),
        },
      ],
    },
  ],
});
```

- `import()` must be a pure function of the file contents and your options: results are cached by content hash.
- An importer in another language sets `command: ["my-tool", "--json"]` instead. It gets the `SourceFile` as JSON on stdin and prints an `ImportResult` as JSON on stdout.
- `debuff inspect --json` lists every plugin's importers, commands and steps.

## CLI commands and scenario steps

Tooling plugins can also add namespaced CLI commands and scenario step types:

```ts
export default defineConfig({
  plugins: [
    {
      name: "demo",
      apiVersion: 1,
      commands: [{ name: "greet", description: "Say hello", run: ({ args }) => (console.log("hello", ...args), 0) }],
      scenarioSteps: [
        {
          name: "expect-pops",
          description: "Assert the pop counter",
          schema: { type: "integer", minimum: 0 },
          run: async (value, { call }) => {
            const { state } = await call<{ state: { pops: number } }>("state");
            return state.pops === value ? undefined : `expected ${value} pops, got ${state.pops}`;
          },
        },
      ],
    },
  ],
});
```

- `debuff demo:greet` runs the command, and `debuff --help` lists it.
- `{ "demo:expect-pops": 1 }` works in any scenario. `debuff scenario` writes `.debuff/scenario.schema.json` with every plugin step, so point `$schema` there for editor completion.

## Templates

Share a starter as any git repository with a `package.json` at its root (or in a subfolder):

```bash
npm create debuff@latest my-game -- --template github:you/your-template
npm create debuff@latest my-game -- --template gitlab:you/repo/templates/arcade#v1
```

`github:`, `gitlab:`, `bitbucket:` and `sourcehut:` sources are supported, with optional subfolders and `#ref`. No git binary is needed.
