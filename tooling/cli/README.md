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
| `debuff fuzz [--seconds] [--runs] [--seed] [--keys] [--ignore]` | Play headless with random but plausible input. Reports explained errors, stuck states and loops (the scene, or two state fields, flipping between the same two values), each saved as a scenario in `.debuff/fuzz/` that reproduces it. `--ignore state.shots` skips noisy fields. Exits 1 on errors |
| `debuff telemetry [on\|off\|status]` | Anonymous build registration: after a successful build, `debuff build` sends a random project id, the package name and the debuff version to debuff.jp, so we can find games made with debuff. Off in CI, or with `debuff telemetry off` / `DEBUFF_TELEMETRY=0`. [What's sent](https://debuff.jp/docs/telemetry) |
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

Time advances only through `wait` and `until` steps, so runs are deterministic. `until` steps one tick at a time until its conditions hold, and fails if they don't `within` that many steps (default 600), so a scenario says "until the player lands" instead of guessing a wait. Paths read the dev state: `scene`, `tick`, `state.*` (your `inspect()`), and `events.<name>`, the number of times the game called `game.emit("<name>")` (0 until the first). For example `{ "until": { "events.coin": { "gte": 1 } }, "within": 60 }`. Replays saved from the dev panel (or the MCP `game_replay` tool) are scenarios too. ### Accessibility checks

Scenarios can screen what the game actually draws:

- `{ "flashes": 240 }` plays 240 steps and fails on flashing that could trigger photosensitive seizures: more than three flashes a second over a quarter of a 10° field. It approximates WCAG 2.3.1's general flash threshold, taking the 10° field as a third of the screen each way.
- `{ "contrast": [x, y, w, h], "min": 4.5 }` fails if the light and dark parts of a region (say, your HUD text) contrast less than `min` (default 4.5:1, WCAG AA for text).
- `"reducedMotion": true` at the top of a scenario runs it with the browser asking for reduced motion, so you can check that mode too.

These are screening checks on one run, not a certification: a pass means nothing obviously unsafe happened in the steps you played. Red flashes aren't checked yet.

Captures are compared against per-platform baselines in `scenarios/__baselines__/`. A missing baseline is recorded unless you pass `--strict`. Set `DEBUFF_BROWSER` to use a specific Chromium build.

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
- `font@6x9.aseprite` flattens to one image with a 6x9 grid, ready for `BitmapFont`.
- Hidden layers are left out, so guide layers stay in the source.

It looks for Aseprite in `$ASEPRITE`, then on `PATH`, then in the usual install folders (including Steam). You can also pass `aseprite({ binary })`. If it can't find Aseprite, the build warns and skips those files. Results are cached by file contents, so Aseprite only runs when a file changes.

`aseprite/new-font.lua` creates a blank font sheet with the grid set up:

```bash
aseprite -b --script-param w=6 --script-param h=9 --script-param out=assets/font@6x9.aseprite --script node_modules/@debuffjp/cli/aseprite/new-font.lua
```

### tenten

[tenten](https://github.com/debuffjp/tenten) is a headless pixel-art tool for coding agents: an MCP server draws sprites and animations and saves them as `.tt`, a JSON file with the pixels as text grids that diffs in git. `.tt` files in `assets/` become PNGs and sprite sheets with no configuration, the same way `aseprite()` does for `.aseprite`. Add the `tenten()` plugin only to change how tenten is run:

```ts
import { defineConfig, tenten } from "@debuffjp/cli";

export default defineConfig({ plugins: [tenten({ command: ["node", "../tenten/bin/tenten.js"] })] });
```

- `slime.tt` with several frames becomes a sprite sheet: `assets.frames("slime")` returns the frames in order.
- `font@6x9.tt` flattens to one image with a 6x9 grid.

debuff runs tenten from `$TENTEN` (its `bin/tenten.js`), then the copy installed in the project, and otherwise fetches it with `npx -y tenten` the first time a `.tt` file is seen. tenten needs Node 24. Results are cached by file contents.
