# ADR 0004: Plugin API

- Status: accepted
- Date: 2026-10-16
- Related: ADR 0005 (toolchain strategy)

## Goal

Let the community extend debuff without forking it, in a way that is:

- **Explicit.** Plugins are listed in code or config. No auto-discovery magic.
- **Layer-safe.** Browser plugins never pull Node code into bundles, and vice versa.
- **Inspectable.** Humans and agents can list what each plugin contributes (`debuff inspect`, dev hooks).
- **Small.** A handful of extension points, each with a typed contract, so features don't each need their own.
- **Dogfooded.** First-party optional features (Aseprite import, platform adapters…) are built as plugins.

## Where people want to extend

| Layer | Examples | Runs in |
| --- | --- | --- |
| Runtime | physics, tilemap renderer, platform SDK adapters (itch, Poki, Wavedash), analytics, debug draw | browser |
| Assets | Aseprite, Tiled/LDtk, fonts, atlas packing, audio compression | Node (or a native process) |
| CLI | `deploy`, `jam submit`, generators | Node |
| Testing / agents | custom scenario steps, extra inspect data | both |
| Templates | community starters | `create-debuff` |

## Options

### A. No plugin API, just composable libraries and Vite plugins

What we have today. Simple, but there's no standard way to add asset importers, CLI commands, scenario steps or inspect data, so each extension invents its own and agents can't discover them.

### B. One unified plugin object spanning browser and Node (in the style of Nuxt modules)

One install point, but it mixes layers. Bundlers have to be trusted to drop Node code, and the dev-boundary guarantee weakens. Plugins also grow hard to type and test.

### C. Two narrow, typed contracts, one per layer, in one package (recommended)

A plugin package exposes **a runtime entry and/or a tooling entry** through `exports`:

```jsonc
// package.json of debuff-plugin-aseprite
{
  "name": "debuff-plugin-aseprite",
  "exports": {
    ".": "./dist/runtime.js",       // optional: browser code
    "./tooling": "./dist/tooling.js" // optional: Node code
  },
  "peerDependencies": { "@debuffjp/core": "^0.x", "@debuffjp/cli": "^0.x" },
  "keywords": ["debuff-plugin"]
}
```

### D. Event bus or tapable-style hooks everywhere

Maximum flexibility, but hard to type and document. Ordering bugs are hard to diagnose, and agents can't reason about the hooks statically.

## Recommendation: C

### Runtime contract (`@debuffjp/core`)

```ts
export interface RuntimePlugin {
  /** Unique, kebab-case. Namespaces params and inspect data. */
  name: string;
  /** Called once by game.use(). Return a cleanup function if needed. */
  install(game: Game): void | (() => void);
}

game.use(physics({ gravity: 900 }));
```

`Game` gains typed lifecycle hooks, which generalise today's `afterUpdate`:

```ts
game.hooks.beforeUpdate(fn) / afterUpdate(fn) / beforeRender(fn) / afterRender(fn) / sceneChange(fn)
// each returns an unsubscribe function
```

Plugins contribute inspectable state through `game.inspect.register(name, () => json)`, which appears in `__DEBUFF_DEV__.state().plugins[name]`. Their params go under `game.params.define(\`${name}.…\`)`. `game.plugins` lists installed plugins by name.

What runtime plugins are **not**: no global registries, no monkey-patching `Game`, no required base classes.

### Tooling contract (`@debuffjp/cli`)

Configured explicitly in an optional `debuff.config.ts`:

```ts
import { defineConfig } from "@debuffjp/cli";
import aseprite from "debuff-plugin-aseprite/tooling";

export default defineConfig({
  plugins: [aseprite({ trimFrames: true })],
});
```

```ts
export interface ToolingPlugin {
  name: string;
  /** Contract version this plugin targets. The CLI rejects incompatible plugins with a clear error. */
  apiVersion: 1;
  /** Turn source files into manifest entries and generated outputs. */
  assets?: AssetImporter[];
  /** Extra CLI commands, namespaced: `debuff aseprite:watch`. */
  commands?: CommandDef[];
  /** Extra scenario step types, each with a JSON Schema fragment merged into the scenario schema. */
  scenarioSteps?: StepDef[];
  /** Vite plugins to add (escape hatch for anything else). */
  vite?: VitePlugin | VitePlugin[];
}

export interface AssetImporter {
  /** File patterns this importer claims, e.g. ["**/*.aseprite", "**/*.ase"]. */
  match: string[];
  /** Pure function of the inputs. The output is cached by content hash. Never modifies sources. */
  import(file: SourceFile, ctx: ImportContext): Promise<ImportResult>;
}
```

**Language-agnostic importers (ADR 0005):** an importer may instead declare `command: ["my-tool", "--json"]`. The CLI then sends the `SourceFile` JSON on stdin and reads an `ImportResult` JSON on stdout. Both shapes are published as JSON Schemas, so a Rust or Go asset processor is a first-class plugin.

### Discovery and inspection

- No auto-loading from `node_modules`. Only what's in `debuff.config.ts` or passed to `game.use()` runs.
- `debuff inspect --json` lists tooling plugins and what they contribute (importers, commands, steps). `__DEBUFF_DEV__.state().plugins` shows runtime plugins.
- The `debuff-plugin` npm keyword makes plugins findable for a future registry page.

### Naming

- First-party: `@debuffjp/plugin-<name>`
- Community: `debuff-plugin-<name>` or `@scope/debuff-plugin-<name>`

### Templates

`create-debuff --template <id | github:user/repo | npm:package>`, so community templates need no core change.

## Delivery

1. **Runtime contract.** `game.use`, `game.hooks`, `game.inspect`, `game.plugins`. Rebuild `@debuffjp/dev` and `@debuffjp/input`'s step hook on the new hooks to prove the contract.
2. **Tooling contract.** `debuff.config.ts`, `defineConfig`, `assets` importers (the in-process and stdio forms), and `inspect` output. Ship `@debuffjp/plugin-aseprite` as the reference plugin.
3. **Commands and scenario steps.** Merged JSON Schema for steps.
4. **Templates from git/npm.**

Each phase ships with docs, a plugin authoring guide and contract tests that plugins can run themselves.

## Consequences

- Two small contracts to keep stable instead of one large one. Both are versioned and listed in `docs/stability.md`.
- A plugin's runtime cost is visible in the size report, because it's an ordinary import.
- Some extensions won't fit the contracts. The `vite` escape hatch and plain libraries remain available, and we add extension points only when several plugins need them.

## Resolved questions

1. **Config format:** TypeScript only (`debuff.config.ts`). Tools that can't run TS read `debuff inspect --json`.
2. **Command namespacing:** colon form, e.g. `debuff aseprite:watch`.
3. **Dev-boundary allowlist:** plugins can't extend it. Plugin dev code lives behind `import.meta.env.DEV`, like everyone else's.

## Amendments

### 2026-10-23: `renderScene` hook and ordered `gameEvent`

Building the first plugins outside this repo ([debuffjp/plugins](https://github.com/debuffjp/plugins)) showed two gaps:

1. A plugin could draw under or over the scene but not through a target or filter, so full-frame post effects (CRT, palette swap) weren't possible as plugins. `game.hooks.renderScene((draw, render) => ...)` wraps `beforeRender` and the scene's render. `afterRender` stays outside, so HUD overlays and dev tools aren't post-processed.
2. An event emitted from a `gameEvent` listener reached later listeners before the event that caused it (an achievements plugin's `achievement` landed in analytics before the `coin`). `game.emit` now queues events emitted during delivery and sends them after.

`@debuffjp/core/testing` exports `createTestGame()`, so plugins can run contract tests themselves, as this ADR's delivery plan promised.

