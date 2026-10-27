# @debuffjp/cli

## 0.17.0

### Minor Changes

- ea43c61: `debuff doctor` checks a project's setup in one pass and prints a fix for each problem: Node version, debuff packages on one version, `node_modules` matching `package.json`, a nested copy of `@debuffjp/core`, `@debuffjp/dev` and TypeScript, `debuff.config.ts`, the asset pipeline, `saves.json`, agent files (`AGENTS.md`, `CLAUDE.md`, `.mcp.json`), the browser scenarios use, and a `NODE_ENV` left set in the shell. `--live` also starts the dev server and checks the game exposes its dev hooks. It exits 1 when a required check fails, and `--json` prints every check with an id. The MCP server gains a `doctor` tool, and new projects' `AGENTS.md` lists the command.

### Patch Changes

- Updated dependencies [ea43c61]
  - create-debuff@0.17.0

## 0.16.0

### Minor Changes

- efec916: The dev hooks' `pointerDown(x, y, kind?)` and `tap(x, y, kind?)` take what is pressing: `"mouse"` (the default, as before), `"touch"` or `"pen"`. The game sees it in `pointer.kind`. A touch or pen press is contact 1 in `pointer.touches` and the primary pointer, and a mouse press is only the primary pointer, so a dev drag no longer looks like both a mouse and a touch. Scenarios take `{ "pointerDown": [x, y, "touch"] }` and `{ "tap": [x, y, "pen"] }`, and keiko's `game.pointerDown(x, y, "touch")` does the same, through the dev hooks or as real touch events.
- e17b3df: `debuff fuzz --keys` accepts the gestures `Wheel` (a random scroll) and `Touch` (a finger tapping or dragging somewhere on the game), so touch and wheel games can be fuzzed: `debuff fuzz --keys Touch,Wheel`. They're opt-in; the default keys are unchanged.
- 96bebe8: The right and middle mouse buttons are bindable: `"PointerRight"` and `"PointerMiddle"`, so an action like right-click remove goes through `input.down/pressed/released`, scenarios and fuzz like any key. `input.pointer.right` and `input.pointer.middle` hold `down`, `pressed` and `released`, including buttons pressed while another is held; `pointer.pressButton("right")` and `releaseButton` simulate them. The dev hooks' `press("PointerRight")`, scenario `{ "press": "PointerRight" }` and `debuff fuzz --keys PointerRight` press the button, and recorded replays keep it. The primary pointer (`"Pointer"`) is unchanged.
- 068ed32: `launch.video` in `debuff.config.ts`: point it at a short looping MP4 and `debuff build` copies it to `dist/preview.mp4` and adds `og:video` tags, size included, so Discord and other apps that play link previews show the clip.
- 8e669fe: Tests and scenarios can press the right mouse button, scroll the wheel and touch with several fingers, all through the same paths as real input.
  
  - keiko: `game.press("PointerRight")` (and `"PointerMiddle"`), `game.wheel(dy, dx?)`, and `game.touchDown(id, x, y)`, `touchMove(id, x, y)` and `touchUp(id)`. debuff games are driven through their dev hooks. Other games get real DOM events: mouse button presses (a button pressed while another is held arrives as a `pointermove`, as in browsers, and the right button fires `contextmenu`), `wheel` events, and `pointerType: "touch"` pointer events with touch events. `game.replay()` plays the new scenario steps.
  - Dev hooks: `wheel(dy, dx?)`, `touchDown(id, x, y, kind?)`, `touchMove(id, x, y)` and `touchUp(id)`. Recorded replays keep wheel scrolls and touches, so a session played on a phone replays exactly. They need `@debuffjp/input` 0.16 and say so on older versions.
  - Scenarios: `{ "wheel": dy }` or `{ "wheel": [dy, dx] }`, `{ "touchDown": [id, x, y] }` (`[id, x, y, "pen"]` for a pen), `{ "touchMove": [id, x, y] }` and `{ "touchUp": id }`.

### Patch Changes

- b87c265: Scenario fixes in `debuff scenario` and keiko's `game.replay()`:
  
  - `{ "tap": "KeyT" }` taps the key for one step, as keiko's `game.tap("KeyT")` does. Before, `debuff scenario` silently spread the string into `tap(x, y)`, and keiko pressed the wrong key. The schema accepts a key code. A `tap` that is neither a code nor a point fails with an explanation.
  - `{ "expect": { "state.x": 0 } }` (and the same in `until`) fails with `state.x: expected a comparison object like { "eq": 0 }, got 0`, instead of a TypeError or a silent pass. An object with none of `eq`, `gt`, `gte`, `lt`, `lte` and `approx` is reported the same way.
- Updated dependencies [efec916]
- Updated dependencies [812b958]
- Updated dependencies [70a00c9]
- Updated dependencies [b87c265]
- Updated dependencies [8e669fe]
  - keiko@0.7.0
  - create-debuff@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [bc01ad0]
- Updated dependencies [7dbe21a]
  - create-debuff@0.15.0

## 0.14.0

### Minor Changes

- 7bf806f: `debuff dev` re-fetches changed level and data files in place instead of reloading the page, when the compiled manifest serves the file as json or text and a loader holds it; anything else (images, sounds, added or removed files, data no loader has) still reloads the page. Asset recompiles after a change run one at a time, so the served manifest is always the latest.
- 3e03829: `.tt` sprites drawn with [tenten](https://github.com/debuffjp/tenten), the pixel-art MCP server for agents, become PNGs and sprite sheets in `assets/` with no configuration, like `.aseprite` files do with `aseprite()`. tenten is found in `$TENTEN` or the project, and otherwise fetched with `npx -y tenten` the first time a `.tt` file appears; `tenten({ command })` overrides that. New projects' `.mcp.json` lists the tenten server next to debuff's, and the template agent guides, the debuff skill and the MCP server tell agents to draw pixel art with tenten unless the human names another tool.

### Patch Changes

- create-debuff@0.14.0

## 0.13.3

### Patch Changes

- create-debuff@0.13.3

## 0.13.2

### Patch Changes

- create-debuff@0.13.2

## 0.13.1

### Patch Changes

- create-debuff@0.13.1

## 0.13.0

### Patch Changes

- create-debuff@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [c6311a2]
  - keiko@0.6.0
  - create-debuff@0.12.0

## 0.11.0

### Minor Changes

- 4074fea: Saves survive game updates (ADR 0014). `Storage` uses a saved field only if its JSON type matches the default's, so a save from an older version of the game can't break it (the original is kept once under `<key>:backup`). `new Storage(key, defaults, { version, migrate })` upgrades older saves once. `debuff build` finds every save, compares it with `saves.json` (committed, like a lockfile), fails if a save key disappears and warns when a field's type changes without a version bump; `--accept-saves` records intended changes. `debuff inspect` and the MCP `build` tool include saves, and the templates ship a `saves.json`.

### Patch Changes

- Updated dependencies [4074fea]
  - create-debuff@0.11.0

## 0.10.0

### Minor Changes

- ea6a86a: Type errors while you play: set `typecheck: true` in `debuff.config.ts` and `debuff dev` type-checks with your project's own `tsc` after every save. Type errors show as a badge and cards in the dev overlay (the game keeps running), in `window.__DEBUFF_DEV__.typeErrors()`, and to agents through the new `typecheck` MCP tool, which also works without a browser.

### Patch Changes

- Updated dependencies [698f6f0]
  - create-debuff@0.10.0

## 0.9.5

### Patch Changes

- create-debuff@0.9.5

## 0.9.4

### Patch Changes

- create-debuff@0.9.4

## 0.9.3

### Patch Changes

- create-debuff@0.9.3

## 0.9.2

### Patch Changes

- c2a9cfa: The dev server's agent endpoints now refuse requests from other origins and POSTs that aren't JSON, so a website you visit can no longer write scenarios or drive your game.
- 7c2ee14: Failed asset imports are no longer cached, malformed asset URLs get a 400 instead of hanging, sibling folders like `assets-src/` no longer trigger reloads, and image preloads match the versioned asset URLs.
- cc424e9: Gamepad input is now recorded, so rewind, the reload that keeps your place, and replays saved as scenarios reproduce pad sessions. Scenarios gain a `pad` step.
- Updated dependencies [1754dac]
- Updated dependencies [97deedd]
  - keiko@0.5.1
  - create-debuff@0.9.2

## 0.9.1

### Patch Changes

- create-debuff@0.9.1

## 0.9.0

### Minor Changes

- 61798e2: `debuff build` now adds link-preview tags (Open Graph and Twitter), a web app manifest and a preview image (your first scenario baseline) to `dist/`, configured by `launch` in `debuff.config.ts`. New `debuff ship itch|wavedash|press` gets a build ready for a store: an itch.io zip with limit checks, Wavedash config and `Wavedash.init()` checks, or a press kit with a factsheet and screenshots. It never uploads anything.

### Patch Changes

- Updated dependencies [d4a6c44]
- Updated dependencies [a9b440f]
- Updated dependencies [a761975]
- Updated dependencies [cfa9fff]
- Updated dependencies [d159eef]
  - keiko@0.5.0
  - create-debuff@0.9.0

## 0.8.0

### Minor Changes

- 0f12c4b: `debuff build` registers the project anonymously with debuff.jp (a random project id, the package name and the CLI version; nothing about code, paths or players), so we can find games made with debuff. A one-time notice says so. Turn it off with `debuff telemetry off` or `DEBUFF_TELEMETRY=0`; it is off in CI. Details: https://debuff.jp/docs/telemetry
- 5504289: - **juice:** `squash()` only replaces scale tweens, so a move or fade already running on the same object keeps going (it used to stop every tween on its target). `tweens.kill(target, props?)` can stop just some properties, and `tweens.has(target, prop?)` says whether something is still animating.
  - **Scenarios and fuzz:** set the browser viewport with `scenarios: { viewport: [360, 640] }` in `debuff.config.ts`, or `"viewport"` in a scenario file, so portrait games are tested at their own shape instead of shrunk into 960×540.

### Patch Changes

- 77fe8c6: Fix: a project with a `debuff.config.ts` built in development mode (loading the config through Vite set `NODE_ENV=development`), so `debuff build` failed its dev-leak check or, worse, could ship the dev tools. Loading the config now leaves `NODE_ENV` as it was.
- Updated dependencies [2a1f9d3]
  - create-debuff@0.8.0

## 0.7.1

### Patch Changes

- 1d8036c: - **Camera:** a followed sprite no longer shimmies a pixel while it moves. `Camera.view()` stops rounding its offset, and `Draw` snaps each sprite once, after the camera.
  - **Scenario `contrast`:** samples one cell per logical pixel (up to 1024 a side) instead of averaging regions wider than 256 px, and compares the background with the text on it, so short labels in big boxes and 1-pixel pixel-font strokes are judged correctly.
  - **`debuff fuzz`:** a loop now needs the scene, or two state fields, flipping together; a single counter rising and falling (bullets, particles) no longer counts. `--ignore <paths>` skips noisy fields.
- create-debuff@0.7.1

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
