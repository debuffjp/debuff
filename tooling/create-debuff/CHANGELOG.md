# create-debuff

## 0.9.3

No changes in this release.

## 0.9.2

No changes in this release.

## 0.9.1

No changes in this release.

## 0.9.0

### Minor Changes

- d159eef: The "squish" look everywhere:
  
  - **ui:** panels and menus that set no frame of their own get round corners, no outline, light labels, lime focus and a jelly highlight that squashes when focus moves (`debuffFrame` is this look; `FrameStyle.radius` is new). Styles that set their own borders or fill are untouched.
  - **dev panel:** soft rounded panel, pill buttons and tabs, controls that squash on press, round toggles and sliders.
  - **CLI:** buff is flat with dot eyes, and squashes when a command succeeds.
  - **basic template:** buff is a flat jelly block with pill eyes, little feet, an idle jiggle and a hop on pop.

## 0.8.0

### Minor Changes

- 2a1f9d3: New template: **squish**, a squishy match-3 for touch and mouse (swaps, cascades, combos, squash-and-stretch juice, drawn in code with no art files). `npm create debuff@latest my-game -- --template squish`.

## 0.7.1

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.1

No changes in this release.

## 0.5.0

### Patch Changes

- c0236d6: New: accessibility checks in scenarios.
  
  - `{ "flashes": 240 }` plays 240 steps, samples every frame, and fails on flashing that could trigger photosensitive seizures: more than three flashes a second over a quarter of a 10° field. This approximates WCAG 2.3.1's general flash threshold.
  - `{ "contrast": [x, y, w, h], "min": 4.5 }` checks the contrast between the light and dark parts of a region, such as HUD text.
  - `"reducedMotion": true` runs a scenario with `prefers-reduced-motion: reduce`.
  
  These are screening checks on what the game actually draws, not a certification. The dev hooks gain `luminance(cols, rows, region?)`. keiko keeps time moving through `flashes` steps and skips `contrast`, since nothing is drawn headless. The platformer ships an `accessibility` scenario, and new projects' `AGENTS.md` asks agents to add these checks for flashing effects and new HUD text.
- 437f2ac: Two fewer dependencies: terminal colours (`picocolors`) and argument parsing (`cac`) are now small built-in modules with the same behaviour, including `NO_COLOR`/`FORCE_COLOR` and the flag syntax plugin commands use.
- b37f2d9: Document turning off the splash for portals: the `splash` option's docs and new projects' AGENTS.md say Poki requires `splash: false`, with a link to the new publishing guide.
- 28b3d48: New: assertions on what happens in the game, not on pixels.
  
  - `game.emit("coin", detail?)` marks a game event. The dev tools count events by name in `state().events`, and `__DEBUFF_DEV__.events()` lists the latest with their tick and detail.
  - Scenarios have an `until` step: `{ "until": { "events.coin": { "gte": 1 } }, "within": 60 }` steps one tick at a time until the conditions hold, and fails with the actual values if they don't. Use it instead of guessing a `wait`. `expect` and `until` read `events.<name>` as 0 until the first emit.
  - keiko replays `until` steps and adds `game.emitted("coin")`.
  - New projects' `AGENTS.md` tells agents to prefer state and event assertions over screenshots, and the platformer emits `coin` and `win`, with a `collect-coin` scenario that uses them.

## 0.4.0

### Patch Changes

- 793eab1: The "Next steps" note mentions `npm test` when the new project has logic tests.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- 91f7088: Templates include example logic tests in `tests/` and `keiko` as a dev dependency; `npm test` runs logic tests, then scenarios. `AGENTS.md` explains when to use which.

### Patch Changes

- d716ede: Canvas 2D fallback: tinted textures now get their colour, not just their alpha, so text and bitmap fonts render in the requested colour as on WebGL2. Platformer template: a pause button in the HUD for touch players.
- 134c84a: `draw.measure(text, font)` returns the box `draw.text` fills. `@debuffjp/ui` now lays menus out from measured text: a fixed cursor column, right-aligned value rows with left/right changes, `drawPanel` (a titled, centred, evenly padded frame), `panelAround`, and positions snapped to whole pixels. The platformer's pause menu gains a settings screen with a saved volume.

## 0.2.0

### Minor Changes

- 23edf1a: Built-in guidance for coding agents:
  
  - **MCP prompts:** `playtest`, `fix-errors`, `tune-feel`, `add-mechanic` and `explain-stutter` are step-by-step workflows built from the server's tools. They show up as slash commands in clients like Claude Code, and each keeps creative calls with the human.
  - **New projects** include an `AGENTS.md` (commands, layout, work loop and rules) and a `CLAUDE.md` that points to it, so agents start with the right context.

### Patch Changes

- cbb7ecc: Bin paths are now written as `bin/x.js` instead of `./bin/x.js`. npm 11 treats the `./` form as invalid and strips the command, which would have left `debuff`, `debuff-mcp` and `npm create debuff` with nothing to run.
- 9f96ee5: First-run fixes: official templates download from the git tag of the create-debuff release instead of main; unknown CLI commands print "unknown command: X" and exit 1; a capture mismatch prints the actual, baseline and diff image paths (a diff image is now written) and how to accept the change; MCP `root` descriptions say absolute paths work.
- f300156: New: `debuff fuzz` plays your game headlessly with random but plausible input: movement keys held, action keys tapped. It reports runtime errors, explained and source-mapped, and stuck states where the scene's `inspect()` stops changing.
  
  Each finding is saved as a scenario in `.debuff/fuzz/` that replays it exactly, because debuff's fixed steps and seeded RNG make runs deterministic. Run `debuff scenario <file>` to reproduce a bug, and again after the fix to verify it. The same `--seed` repeats a run, and the command exits non-zero on errors, so it can gate CI. The MCP server exposes it as the `fuzz` tool, and new projects' `AGENTS.md` tells agents to use it.
- 7c90762: New official template: `mossfell`, a top-down action-adventure (`npm create debuff@latest my-game -- --template mossfell`). `debuff build` now uses relative asset URLs, so a build works from any folder, such as itch.io, GitHub Pages or a `/play/` subpath.
- 9fb8348: Platformer template: pause menu (Esc, P or Start) built on `@debuffjp/ui`, with a fade on restart.
- 5642db8: New: deterministic replays. With `devTools({ input })`, the dev tools record every key, pointer and param change from page load. The overlay's log tab has "save replay" and "copy replay", `window.__DEBUFF_DEV__.replay(toTick?)` returns one, and the MCP server's `game_replay` tool saves one to `.debuff/replays/`. A replay is a scenario, so `debuff scenario <file>` plays the session back exactly. Pass a note's tick to reproduce what the human saw when they flagged it. Anything a replay can't reproduce, such as slow motion, is listed in `warnings`.

## 0.1.0

### Minor Changes

- 155638d: New `@debuffjp/mcp`: an MCP server with project tools (`inspect_project`, `list_assets`, `build`, `run_scenarios`) and live-game tools (`game_start`, `game_step`, `game_input`, `game_state`, `game_params`, `game_set_param`, `game_capture`, `game_errors`, `game_stop`). Templates include `.mcp.json`. `@debuffjp/cli` exports `inspectProject`, `launchBrowser`, `callHook` and `hooksReady`.
- f609f0b: New official **platformer** template (`npm create debuff -- --template platformer`): buff runs and jumps through a Tiled level with tile collision, one-way platforms, coins, a goal, an automatically built atlas, coyote time, jump buffering and fully tunable movement. Official templates other than `basic` download on demand from the debuff repo, so they never grow the create-debuff package. `create()` and `resolveTemplate()` are new exports.
- ab4a23d: Community templates from git (ADR 0004, phase 4): `--template github:user/repo[/subdir][#ref]`, plus `gitlab:`, `bitbucket:` and `sourcehut:`. Downloads use giget, so no git binary is needed.
- b25d482: Tooling plugins (ADR 0004, phase 2a).
  
  - New: `debuff.config.ts` with `defineConfig({ plugins })`, `ToolingPlugin` with function and command (any language, JSON over stdio) asset importers, cached by content hash.
  - **Breaking:** source assets move from `public/assets/` to `assets/`. The manifest is generated in memory and is no longer written to disk, and builds ship only files the manifest references.
  - `debuff assets --json` and `debuff inspect` report importers and plugin contributions.

### Patch Changes

- c4fe419: Branded tooling: buff appears as terminal pixel art in CLI headers and reacts to results (happy or oops). A lime palette with sky, pink, amber and violet accents colours CLI output. The dev overlay gets a live buff that blinks and looks worried on frame spikes, a colour-coded FPS chip and accent-coloured param groups.
- 71b6dd3: The brand lime is now `#cffb2d`, the Debuff Foundation colour. Its tints are rebuilt around it, and the change covers the splash, the dev panel, the CLI colours, the templates and the art.
