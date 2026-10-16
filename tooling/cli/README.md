# @debuff/cli

The `debuff` command: dev server, production builds with size reports, asset manifests, browser scenarios and project inspection. Built on Vite.

```bash
npm install -D @debuff/cli
npx debuff --help
```

| Command | What it does |
| --- | --- |
| `debuff create [dir]` | Scaffold a game (same as `npm create debuff`) |
| `debuff dev [--port] [--host]` | Dev server with hot reload; regenerates the asset manifest on change |
| `debuff build [--sourcemap]` | Production build, then a raw/gzip/brotli report. Fails if dev-only code leaks |
| `debuff report` | Size report for an existing `dist/` |
| `debuff assets` | Regenerate `public/assets/manifest.json`, list possibly unused assets |
| `debuff scenario [files] [--update] [--strict]` | Run `scenarios/*.json` in headless Chrome/Edge |
| `debuff inspect` | JSON summary of the project |

Add `--json` for machine-readable output and `--root <dir>` to target another project.

## Scenarios

```json
{
  "$schema": "../node_modules/@debuff/cli/schema/scenario.schema.json",
  "steps": [
    { "press": "ArrowRight" },
    { "wait": 30 },
    { "expect": { "state.player.x": { "gt": 200 } } },
    { "set": { "player.speed": 400 } },
    { "capture": "after-move" }
  ]
}
```

Time advances only through `wait` steps, so runs are deterministic. Captures are compared against per-platform baselines in `scenarios/__baselines__/`. A missing baseline is recorded unless you pass `--strict`. Set `DEBUFF_BROWSER` to use a specific Chromium build.

## Programmatic use

```ts
import { buildReport, compileAssets, runScenarios } from "@debuff/cli";
```
