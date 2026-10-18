# @debuffjp/cli

The `debuff` command: dev server, production builds with size reports, asset manifests, browser scenarios, fuzz playtesting and project inspection. Built on Vite.

```bash
npm install -D @debuffjp/cli
npx debuff --help
```

| Command | What it does |
| --- | --- |
| `debuff create [dir]` | Scaffold a game (same as `npm create debuff`) |
| `debuff dev [--port] [--host]` | Dev server with hot reload; regenerates the asset manifest on change |
| `debuff build [--sourcemap]` | Production build, then a raw/gzip/brotli report. Fails if dev-only code leaks |
| `debuff report` | Size report for an existing `dist/` |
| `debuff assets` | Run the asset pipeline: list every asset, its importer and size, plus unused and generated files |
| `debuff test [files] [-t text] [--json]` | Run logic tests (`tests/**/*.test.ts`) with [keiko](https://github.com/debuffjp/debuff/tree/main/tooling/keiko): the real game in Node, no browser, in milliseconds |
| `debuff scenario [files] [--update] [--strict]` | Run `scenarios/*.json` in headless Chrome/Edge |
| `debuff fuzz [--seconds] [--runs] [--seed] [--keys]` | (next release) Play headless with random but plausible input. Reports explained errors and stuck states, each saved as a scenario in `.debuff/fuzz/` that reproduces it. Exits 1 on errors |
| `debuff inspect` | JSON summary of the project |

Add `--json` for machine-readable output and `--root <dir>` to target another project.

## Scenarios

```json
{
  "$schema": "../node_modules/@debuffjp/cli/schema/scenario.schema.json",
  "steps": [
    { "press": "ArrowRight" },
    { "wait": 30 },
    { "expect": { "state.player.x": { "gt": 200 } } },
    { "set": { "player.speed": 400 } },
    { "capture": "after-move" }
  ]
}
```

Time advances only through `wait` and `until` steps, so runs are deterministic. `until` steps one tick at a time until its conditions hold, and fails if they don't `within` that many steps (default 600), so a scenario says "until the player lands" instead of guessing a wait. Paths read the dev state: `scene`, `tick`, `state.*` (your `inspect()`), and `events.<name>`, the number of times the game called `game.emit("<name>")` (0 until the first). For example `{ "until": { "events.coin": { "gte": 1 } }, "within": 60 }`. Replays saved from the dev panel (or the MCP `game_replay` tool) are scenarios too. Captures are compared against per-platform baselines in `scenarios/__baselines__/`. A missing baseline is recorded unless you pass `--strict`. Set `DEBUFF_BROWSER` to use a specific Chromium build.

## Programmatic use

```ts
import { buildReport, compileAssets, runScenarios } from "@debuffjp/cli";
```

## Assets and plugins

Put source assets in `assets/`. The pipeline builds an in-memory manifest (`/assets/manifest.json`). Only files the manifest references are served in dev and emitted in builds, and sources are never modified.

Add tooling plugins in `debuff.config.ts`:

```ts
import { defineConfig } from "@debuffjp/cli";

export default defineConfig({
  plugins: [
    {
      name: "maps",
      apiVersion: 1,
      // Any language: SourceFile JSON on stdin, ImportResult JSON on stdout.
      assets: [{ name: "maps", extensions: [".map"], command: ["python", "tools/import_map.py"] }],
    },
  ],
});
```

### Aseprite

The first-party `aseprite()` plugin runs Aseprite for you, so `.aseprite` and `.ase` files in `assets/` load like PNGs with no export step:

```ts
import { aseprite, defineConfig } from "@debuffjp/cli";

export default defineConfig({ plugins: [aseprite()] });
```

- `hero.aseprite` with several frames becomes a sprite sheet: `assets.frames("hero")` returns the frames in order.
- `font@6x9.aseprite` flattens to one image with a 6×9 grid, ready for `BitmapFont`.
- Hidden layers are left out, so guide layers stay in the source.

It looks for Aseprite in `$ASEPRITE`, then on `PATH`, then in the usual install folders (including Steam). You can also pass `aseprite({ binary })`. If it can't find Aseprite, the build warns and skips those files. Results are cached by file contents, so Aseprite only runs when a file changes.

`aseprite/new-font.lua` creates a blank font sheet with the grid set up:

```bash
aseprite -b --script-param w=6 --script-param h=9 --script-param out=assets/font@6x9.aseprite --script node_modules/@debuffjp/cli/aseprite/new-font.lua
```
