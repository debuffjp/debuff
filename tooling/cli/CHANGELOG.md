# @debuffjp/cli

## 0.7.0

### Patch Changes

- create-debuff@0.7.0

## 0.6.0

### Patch Changes

- create-debuff@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [444da77]
- Updated dependencies [a586450]
  - keiko@0.4.1
  - create-debuff@0.5.1

## 0.5.0

### Minor Changes

- c0236d6: New: accessibility checks in scenarios.
  
  - `{ "flashes": 240 }` plays 240 steps, samples every frame, and fails on flashing that could trigger photosensitive seizures: more than three flashes a second over a quarter of a 10° field. This approximates WCAG 2.3.1's general flash threshold.
  - `{ "contrast": [x, y, w, h], "min": 4.5 }` checks the contrast between the light and dark parts of a region, such as HUD text.
  - `"reducedMotion": true` runs a scenario with `prefers-reduced-motion: reduce`.
  
  These are screening checks on what the game actually draws, not a certification. The dev hooks gain `luminance(cols, rows, region?)`. keiko keeps time moving through `flashes` steps and skips `contrast`, since nothing is drawn headless. The platformer ships an `accessibility` scenario, and new projects' `AGENTS.md` asks agents to add these checks for flashing effects and new HUD text.
- 446c446: New: state-preserving reload. Under `debuff dev`, a code change no longer sends you back to the start. Just before the page reloads, the dev tools save the session's inputs, and the new code replays them to the tick you were on (without drawing, so it's quick). The game then carries on running. Because the replay runs your new code, a change to how the game plays shows up right where you were. Keys you were holding are let go after the replay. Turn it off with `devTools({ input, keepState: false })`.
- 60fd560: New: rewind. The dev panel's log tab has a timeline slider: drag to any tick of the session and the page reloads, replays your inputs to that tick (without drawing, so it's quick) and pauses there with the game's exact state. You can drag forward again until you play on from the earlier point. Agents can do the same with the MCP `game_rewind` tool, for example at a note's tick, and games with `window.__DEBUFF_DEV__.rewind(tick)`.
  
  **save as scenario** in the panel writes the session so far to `scenarios/<name>.json` through `debuff dev`, with a capture at the end, so a bug you just played becomes a regression test.
  
  `game.step(steps, false)` advances without drawing.
- 28b3d48: New: assertions on what happens in the game, not on pixels.
  
  - `game.emit("coin", detail?)` marks a game event. The dev tools count events by name in `state().events`, and `__DEBUFF_DEV__.events()` lists the latest with their tick and detail.
  - Scenarios have an `until` step: `{ "until": { "events.coin": { "gte": 1 } }, "within": 60 }` steps one tick at a time until the conditions hold, and fails with the actual values if they don't. Use it instead of guessing a `wait`. `expect` and `until` read `events.<name>` as 0 until the first emit.
  - keiko replays `until` steps and adds `game.emitted("coin")`.
  - New projects' `AGENTS.md` tells agents to prefer state and event assertions over screenshots, and the platformer emits `coin` and `win`, with a `collect-coin` scenario that uses them.

### Patch Changes

- 437f2ac: Two fewer dependencies: terminal colours (`picocolors`) and argument parsing (`cac`) are now small built-in modules with the same behaviour, including `NO_COLOR`/`FORCE_COLOR` and the flag syntax plugin commands use.
- 1f17bac: Smaller startup: the splash and the Canvas 2D fallback load on demand, so WebGL2 browsers never download the fallback and games without the splash never download it. The starter's startup code drops from 14.1 to 13.3 kB brotli. `debuff build` reports code at startup separately from code loaded on demand.
- Updated dependencies [c0236d6]
- Updated dependencies [437f2ac]
- Updated dependencies [b37f2d9]
- Updated dependencies [28b3d48]
  - keiko@0.4.0
  - create-debuff@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [793eab1]
- Updated dependencies [27d109a]
  - create-debuff@0.4.0
  - keiko@0.3.1

## 0.3.3

### Patch Changes

- Updated dependencies [3da761c]
  - keiko@0.3.0
  - create-debuff@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [28f9d49]
  - keiko@0.2.0
  - create-debuff@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [d359aa1]
  - keiko@0.1.1
  - create-debuff@0.3.1

## 0.3.0

### Minor Changes

- 91f7088: `debuff test` runs logic tests (`tests/**/*.test.ts`) with [keiko](https://github.com/debuffjp/debuff/tree/main/tooling/keiko): the real game in Node with no browser, on a virtual clock, in milliseconds. `-t <text>` filters by name; `--json` gives a report for tools.
- 01c7c17: `aseprite()` tooling plugin: `.aseprite`/`.ase` files in `assets/` are exported by Aseprite automatically. Multi-frame files become sprite sheets (`assets.frames(id)`), `name@WxH.aseprite` flattens to a grid (for `BitmapFont`), hidden layers are skipped, and results are cached. Aseprite is found via `$ASEPRITE`, `PATH` or the usual install folders, including Steam; if it's missing, the build warns instead of failing.
- 1f5fb28: `BitmapFont`: pixel fonts from a sprite-sheet grid, with widths measured from the glyph pixels. Pass one as `font` to `draw.text`, `draw.measure` and `@debuffjp/ui` menus. The CLI ships `aseprite/new-font.lua`, which creates a blank font sheet with the grid set up.

### Patch Changes

- Updated dependencies [d716ede]
- Updated dependencies [134c84a]
  - create-debuff@0.3.0

## 0.2.0

### Minor Changes

- f300156: New: `debuff fuzz` plays your game headlessly with random but plausible input: movement keys held, action keys tapped. It reports runtime errors, explained and source-mapped, and stuck states where the scene's `inspect()` stops changing.
  
  Each finding is saved as a scenario in `.debuff/fuzz/` that replays it exactly, because debuff's fixed steps and seeded RNG make runs deterministic. Run `debuff scenario <file>` to reproduce a bug, and again after the fix to verify it. The same `--seed` repeats a run, and the command exits non-zero on errors, so it can gate CI. The MCP server exposes it as the `fuzz` tool, and new projects' `AGENTS.md` tells agents to use it.
- 0bf6f5b: Scenarios can run game commands: register them with `devTools({ input, commands: { warp: (to) => ... } })` and call them with `{ "command": "warp", "args": ["hollow"] }`, so a scenario can start at a checkpoint without test-only code in the game. Commands are recorded in replays. `debuff scenario --update` now rewrites only baselines that changed. `debuff fuzz` samples state during long holds and reports `loop` findings when a state field keeps flipping between two values with input unchanged, such as stairs that send the player straight back.

### Patch Changes

- cbb7ecc: Bin paths are now written as `bin/x.js` instead of `./bin/x.js`. npm 11 treats the `./` form as invalid and strips the command, which would have left `debuff`, `debuff-mcp` and `npm create debuff` with nothing to run.
- 9f96ee5: First-run fixes: official templates download from the git tag of the create-debuff release instead of main; unknown CLI commands print "unknown command: X" and exit 1; a capture mismatch prints the actual, baseline and diff image paths (a diff image is now written) and how to accept the change; MCP `root` descriptions say absolute paths work.
- 7c90762: New official template: `mossfell`, a top-down action-adventure (`npm create debuff@latest my-game -- --template mossfell`). `debuff build` now uses relative asset URLs, so a build works from any folder, such as itch.io, GitHub Pages or a `/play/` subpath.
- Updated dependencies [23edf1a]
- Updated dependencies [cbb7ecc]
- Updated dependencies [9f96ee5]
- Updated dependencies [f300156]
- Updated dependencies [7c90762]
- Updated dependencies [9fb8348]
- Updated dependencies [5642db8]
  - create-debuff@0.2.0

## 0.1.0

### Minor Changes

- 9d71ad0: Agents can now work on the game you have open. `debuff dev` relays agent commands to the page over Server-Sent Events, and `game_start` in `@debuffjp/mcp` attaches to that live tab when one is open (otherwise it falls back to a headless copy). The overlay shows an agent badge and logs the agent's actions, which you can undo. New MCP tools: `game_pause`, `game_frames` (per-frame breakdown) and `game_notes` (moments you flagged in the overlay). The WebGL2 draw-call count now includes the pending batch.
- 1487920: Automatic texture atlases. The asset pipeline packs PNGs per preload group into atlases (MaxRects, lossless, padded and edge-extruded), in dev and builds, cached by content hash. It's on by default; configure with `assets.atlas` in `debuff.config.ts` (`maxSize`, `padding`, `exclude`, or `false`).
  
  - `@debuffjp/assets`: new `frame(id)` and `frames(id)` work for atlased and standalone images, and assets sharing an atlas share one request. `image(id)` explains what to use for atlased assets.
  - `@debuffjp/tilemap`: tilesets accept an atlas region (`assets.frame(id)`).
- 155638d: New `@debuffjp/mcp`: an MCP server with project tools (`inspect_project`, `list_assets`, `build`, `run_scenarios`) and live-game tools (`game_start`, `game_step`, `game_input`, `game_state`, `game_params`, `game_set_param`, `game_capture`, `game_errors`, `game_stop`). Templates include `.mcp.json`. `@debuffjp/cli` exports `inspectProject`, `launchBrowser`, `callHook` and `hooksReady`.
- ec06222: Tooling plugins (ADR 0004, phase 3): `commands` become `debuff <plugin>:<command>`, and `scenarioSteps` add `{ "<plugin>:<step>": value }` steps with JSON Schemas merged into `.debuff/scenario.schema.json`. Also fixes `debuff --help` printing twice.
- 71c6b6e: The built `index.html` preloads the asset manifest and the default group's images or atlases, so they download alongside the game code instead of after it.
- 451831a: New `@debuffjp/tilemap`: a `Tilemap` with culled, allocation-free rendering through `draw` (with parallax and Tiled flip and rotation flags), tile collision via `map.move(body, dx, dy)` with one-way platforms and no tunnelling, and importers for Tiled (`fromTiled`) and LDtk (`fromLdtk`). The asset pipeline now loads `.tmj`, `.tsj` and `.ldtk` files as JSON.
- b25d482: Tooling plugins (ADR 0004, phase 2a).
  
  - New: `debuff.config.ts` with `defineConfig({ plugins })`, `ToolingPlugin` with function and command (any language, JSON over stdio) asset importers, cached by content hash.
  - **Breaking:** source assets move from `public/assets/` to `assets/`. The manifest is generated in memory and is no longer written to disk, and builds ship only files the manifest references.
  - `debuff assets --json` and `debuff inspect` report importers and plugin contributions.
- f50defb: Batched WebGL2 renderer behind a new `draw` API (ADR 0007).
  
  - New: `game.draw` with `sprite`, `rect`, `circle`, `line`, `text`, a transform stack, `withCamera`, `blend`, `alpha` and `raw`. It uses WebGL2 instanced, multi-texture batching with an automatic Canvas 2D fallback (`renderer: "auto" | "webgl2" | "2d"`), and sustains about 200k sprites at 60 fps on the renderer benchmark.
  - **Breaking:** `Scene.render(ctx)` becomes `Scene.render(draw)`, and render hooks receive `draw`. `game.ctx` is removed. `camera.apply(ctx)` is replaced by `draw.withCamera(camera, fn)` (`camera.view()` returns the matrix). `Sprite.draw`, `Particles.draw` and `Trail.draw` take `draw`.
  - New: `game.redraw()`, `renderer` in the dev state, and `@debuffjp/cli/client` types.

### Patch Changes

- 85ad1d7: The overlay's agent badge now stays on for as long as an agent is attached, not just for 30 seconds after its last action. It turns off when the agent stops or its process exits, and the activity log records "agent disconnected".
- c4fe419: Branded tooling: buff appears as terminal pixel art in CLI headers and reacts to results (happy or oops). A lime palette with sky, pink, amber and violet accents colours CLI output. The dev overlay gets a live buff that blinks and looks worried on frame spikes, a colour-coded FPS chip and accent-coloured param groups.
- Updated dependencies [c4fe419]
- Updated dependencies [71b6dd3]
- Updated dependencies [155638d]
- Updated dependencies [f609f0b]
- Updated dependencies [ab4a23d]
- Updated dependencies [b25d482]
  - create-debuff@0.1.0
