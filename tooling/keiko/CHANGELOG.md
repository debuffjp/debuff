# keiko

## 0.6.0

### Minor Changes

- c6311a2: Agent tooling from building gloop:
  
  - MCP: new `game_command` tool runs a game's dev command by name with JSON args. `game_start` takes `viewport: [w, h]` (headless) and `reducedMotion` to force it on or off. `game_frames` takes `summary` (percentiles and the 3 slowest frames), `game_step` takes `quiet` (no inspect state), and `game_capture` takes `path` to save the PNG in the project. `game_profile` in headless mode now says profiling needs live mode instead of blaming requestAnimationFrame.
  - dev: `state()` reports the logical `width`/`height`, and `reducedMotion` and `reducedMotionForced`; new `reducedMotion(value | null)` hook forces it.
  - core: `Random#state` gets and sets the generator's state, for undo and replays.
  - keiko: `toBeLessThan` / `toBeGreaterThan` matchers; docs say `-t` is a case-insensitive substring match and point async game logic at `run()` / `settle()` instead of `wait()`.
  - MCP: headless errors are now just the message (no `page.evaluate:` prefix or stack).
  - MCP, scenarios and dev: calling a hook an older `@debuffjp/dev` doesn't have now says to update it, instead of "is not a function".

## 0.5.1

### Patch Changes

- 1754dac: `-t/--filter` no longer hides test files that fail to load, and a filter that matches no tests now fails. A test that times out can no longer close the next test's page when it calls `play()` late.
- 97deedd: Commented-out scripts are no longer booted, failures keep their file and line under paths with parentheses, test files outside the project get a clear error, duplicates run once, durations like `1e3ms` work, and `page` accepts backslashes. Needs Node 22.4 or later.

## 0.5.0

### Minor Changes

- cfa9fff: Start testing an existing game in a minute. `npx keiko init` writes a first test for the engine your project uses and prints a starter `window.__KEIKO__` hook. `game.engine` reads the active scene and the pressable, on-screen objects straight from Phaser 3 or PixiJS 8, with no hook. `await game.tapWhenReady(find)` waits for a button to appear and stop moving before tapping it.

### Patch Changes

- d4a6c44: Clearer failures: a `test.deterministic` divergence between runs with different seeds suggests `{ sameSeed: true }` when the game takes its randomness from `Math.random()`, and an `until()` or `eventually()` that times out with the state unchanged since the last pointer `tap()` says the tap may have missed or landed before its target took input.
- a9b440f: The first game in a run gets 60 s to load instead of 10 s, so a cold Vite dependency pre-bundle no longer fails it.
- a761975: keiko: `new Date()` and `Date()` now run on the virtual clock, not just `Date.now()`. `test.deterministic` now gives its second run a different date as well as a different seed, as documented. A pointer press at a new position now moves the pointer there first, as in a browser, so engines that only track the position on moves (KAPLAY) see the right spot. myaku: corrections to the README. Both packages are now checked against real Phaser 3 and 4, PixiJS, KAPLAY, Excalibur and three.js with a local suite (`npm run compat`).

## 0.4.1

### Patch Changes

- 444da77: `npx keiko` runs debuff projects: it loads debuff's Vite plugin from the project's `@debuffjp/cli` (or says to install it), and a JSON fetch answered with index.html now says so instead of `Unexpected token '<'`.
- a586450: Tests no longer hang forever when a game imports a dependency Vite has not pre-bundled yet. Vite's dependency optimizer now gets real timers, and a boot that never settles fails with an error after its timeout instead of waiting forever.

## 0.4.0

### Minor Changes

- 28b3d48: New: assertions on what happens in the game, not on pixels.
  
  - `game.emit("coin", detail?)` marks a game event. The dev tools count events by name in `state().events`, and `__DEBUFF_DEV__.events()` lists the latest with their tick and detail.
  - Scenarios have an `until` step: `{ "until": { "events.coin": { "gte": 1 } }, "within": 60 }` steps one tick at a time until the conditions hold, and fails with the actual values if they don't. Use it instead of guessing a `wait`. `expect` and `until` read `events.<name>` as 0 until the first emit.
  - keiko replays `until` steps and adds `game.emitted("coin")`.
  - New projects' `AGENTS.md` tells agents to prefer state and event assertions over screenshots, and the platformer emits `coin` and `win`, with a `collect-coin` scenario that uses them.

### Patch Changes

- c0236d6: New: accessibility checks in scenarios.
  
  - `{ "flashes": 240 }` plays 240 steps, samples every frame, and fails on flashing that could trigger photosensitive seizures: more than three flashes a second over a quarter of a 10° field. This approximates WCAG 2.3.1's general flash threshold.
  - `{ "contrast": [x, y, w, h], "min": 4.5 }` checks the contrast between the light and dark parts of a region, such as HUD text.
  - `"reducedMotion": true` runs a scenario with `prefers-reduced-motion: reduce`.
  
  These are screening checks on what the game actually draws, not a certification. The dev hooks gain `luminance(cols, rows, region?)`. keiko keeps time moving through `flashes` steps and skips `contrast`, since nothing is drawn headless. The platformer ships an `accessibility` scenario, and new projects' `AGENTS.md` asks agents to add these checks for flashing effects and new HUD text.
- 437f2ac: Two fewer dependencies: terminal colours (`picocolors`) and argument parsing (`cac`) are now small built-in modules with the same behaviour, including `NO_COLOR`/`FORCE_COLOR` and the flag syntax plugin commands use.

## 0.3.1

### Patch Changes

- 27d109a: When `test.deterministic` finds the runs diverging, the error says whether the game was loading in the steps before (a load racing the frames, not game logic) and points to `eventually()`. `onStep` hooks receive whether a load was in flight.

## 0.3.0

### Minor Changes

- 3da761c: Runs real open-source Phaser 3 and PixiJS games: browser module resolution and dependency pre-bundling, inline Web Workers, `blob:` URLs, XHR loads, audio buffers, GLSL reflection and CSS-sized canvases. Adds `run()` and `eventually()` for games whose UI flows are async, and a `viewport` option.

## 0.2.0

### Minor Changes

- 28f9d49: keiko now runs games from every major web engine, verified against Phaser 4, PixiJS 8, KAPLAY, Excalibur and three.js:
  
  - **Timers on the virtual clock:** `setTimeout`, `setInterval` and `requestIdleCallback` wait on game time, so timer-driven gameplay steps deterministically. Nested zero-delay timers clamp like a browser's. Use the new `sleep(ms)` export to wait in real time inside a test.
  - **WebGL:** an inert WebGL 1/2 context, so WebGL-only engines boot (`play({ webgl: false })` to fall back to Canvas 2D).
  - **Pointer input:** the canvas reports a real size and events carry `pageX`/`offsetX`/`x`, so clicks land where they were aimed. Keys go to the focused element or the game canvas.
  - **Loading:** `play()` waits for the game's first requests to finish; `await game.settle()` waits for lazy loads. Games on the virtual clock get their first frame before the test starts. Images are real `<img>` elements; fonts and audio decoding work.
  - **`beforeEach` / `afterEach`**, folders as CLI arguments (`keiko tests/levels`), and errors raised between tests are reported instead of crashing the run.

## 0.1.1

### Patch Changes

- d359aa1: `npx keiko` exits cleanly on Windows (no libuv assertion after the run), and the package links to its own README as its homepage.

## 0.1.0

First release: fast, deterministic logic tests for web games. The real game runs in Node with no browser, on a virtual clock (`requestAnimationFrame`, `performance.now`, `Date.now`, seeded `Math.random`), driven through debuff's dev hooks, an optional `window.__KEIKO__`, or DOM events. `play`, `until`, `during`, `trace`, `test.sweep`, `test.deterministic`, `replay` and `expect`, with the `keiko` CLI.
