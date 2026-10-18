# myaku

## 0.2.0

### Minor Changes

- 4cc2ff5: `npx myaku record [dist|url]`: plays the game in Chrome or Edge with myaku injected (no changes to the game, works on production builds), prints frame-time percentiles and the worst hitches, and fails when `--p95`, `--p99` or `--hitches` budgets are exceeded. `--play` drives the game with a Playwright script, `--cpu` throttles the CPU, `--json`/`--out` write the report. Adds `profiler.reset()`.

## 0.1.0

### Minor Changes

- c49aac3: Engine spans: `update` and `render` for PixiJS 8 and three.js (found automatically through their devtools hooks), Phaser 3 or any global `Phaser` (with `update:<scene>` per scene), and `adapt(profiler, game)` for Phaser 4's ES modules and anything else. Turn off with `myaku({ engines: false })`.
- 771ec97: New package: myaku, a frame profiler for web games. It finds the frames players feel drop and explains each one (script with its location, GC, GPU uploads, shader compiles, layout, browser throttling), for any engine. `@debuffjp/dev` starts it with debuff's update and render as spans and adds `profile()`; the MCP server adds `game_profile`, and the explain-stutter prompt uses it.
- b8f2649: myaku says what it can't see instead of showing a quiet, healthy-looking report: `warnings()` (also in the report and the overlay) for no frames, no canvas context, span names past the limit, and a heap too coarse to see GC. `support.heap` now checks that heap readings actually change, and `unknown` verdicts say when GC can't be ruled out. Span names past 16 are added up under `other` instead of dropped.
