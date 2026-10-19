# myaku

## 0.4.0

### Minor Changes

- 4dfc682: `myaku record --trace` records Chrome's own frame pipeline while it plays, and checks myaku against it: presented-frame percentiles next to the rAF ones, each hitch confirmed or flagged as not seen on screen, gaps myaku missed, and `unknown` hitches named `gpu` or `compositor` from evidence. A lone GPU stall on a lightly loaded GPU stays `unknown` and says it's likely outside the game. `--trace-out` saves the raw trace for DevTools or Perfetto. Opt-in and Chromium only; nothing changes in the page.
  
  The display rate is now measured again every 30 frames, keeping the fastest rate seen, so a slow start (shaders compiling, a heavy first scene) no longer doubles the hitch budget for the whole run. `profiler.budgetMs` can now be set.

### Patch Changes

- c2d6ed6: Frames whose own code overran the budget (say 31 ms of game code) are now hitches even when Chrome stamps the next frame on time. They were invisible before, and too short for Long Animation Frames, which only reports frames over 50 ms.

## 0.3.0

### Minor Changes

- d4a6c44: `update` and `render` spans for Excalibur (found automatically) and KAPLAY (automatic with its default globals, or `adapt(profiler, k)`). PixiJS apps are now found even when Pixi runs its devtools hook before the ticker is set up, which left real games like Puzzling Potions and Bubbo Bubbo without spans.

### Patch Changes

- a761975: keiko: `new Date()` and `Date()` now run on the virtual clock, not just `Date.now()`. `test.deterministic` now gives its second run a different date as well as a different seed, as documented. A pointer press at a new position now moves the pointer there first, as in a browser, so engines that only track the position on moves (KAPLAY) see the right spot. myaku: corrections to the README. Both packages are now checked against real Phaser 3 and 4, PixiJS, KAPLAY, Excalibur and three.js with a local suite (`npm run compat`).
- cfa9fff: Spans that ran but measured 0 ms (the browser rounds `performance.now()`) now still appear in frames and reports, instead of looking as if the engine was never hooked up.

## 0.2.0

### Minor Changes

- 4cc2ff5: `npx myaku record [dist|url]`: plays the game in Chrome or Edge with myaku injected (no changes to the game, works on production builds), prints frame-time percentiles and the worst hitches, and fails when `--p95`, `--p99` or `--hitches` budgets are exceeded. `--play` drives the game with a Playwright script, `--cpu` throttles the CPU, `--json`/`--out` write the report. Adds `profiler.reset()`.

## 0.1.0

### Minor Changes

- c49aac3: Engine spans: `update` and `render` for PixiJS 8 and three.js (found automatically through their devtools hooks), Phaser 3 or any global `Phaser` (with `update:<scene>` per scene), and `adapt(profiler, game)` for Phaser 4's ES modules and anything else. Turn off with `myaku({ engines: false })`.
- 771ec97: New package: myaku, a frame profiler for web games. It finds the frames players feel drop and explains each one (script with its location, GC, GPU uploads, shader compiles, layout, browser throttling), for any engine. `@debuffjp/dev` starts it with debuff's update and render as spans and adds `profile()`; the MCP server adds `game_profile`, and the explain-stutter prompt uses it.
- b8f2649: myaku says what it can't see instead of showing a quiet, healthy-looking report: `warnings()` (also in the report and the overlay) for no frames, no canvas context, span names past the limit, and a heap too coarse to see GC. `support.heap` now checks that heap readings actually change, and `unknown` verdicts say when GC can't be ruled out. Span names past 16 are added up under `other` instead of dropped.
