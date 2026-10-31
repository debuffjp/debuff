# create-debuff

## 0.25.0

No changes in this release.

## 0.24.3

No changes in this release.

## 0.24.2

### Patch Changes

- f343dd3: Agents now make music and sound effects with plonk unless you name another tool, the same way they draw pixel art with tenten. The MCP server's instructions and prompts, every template's `AGENTS.md` and the agent skills say so. Sound files you provide still play through `audio.play`.

## 0.24.1

No changes in this release.

## 0.24.0

### Minor Changes

- 10ad79d: Coding agents now hear about new debuff releases. The agent hook runs at session start too. At most once a day, when a newer debuff is out, it tells the agent the version, the changelog, and that `npx debuff upgrade` moves everything together, with an instruction to tell the human and not upgrade without their go-ahead. It reuses the CLI's daily registry check, and it's off with `DEBUFF_UPDATE_CHECK=0` and in CI.
  
  `debuff dev` now prints the daily update hint under its banner. It never exits, so it used to never show the hint.
  
  `debuff doctor` reports hooks from 0.23 as out of date. `--fix` now rewrites a `.claude/settings.json` or `.codex/hooks.json` that holds only debuff's hooks. It still never touches one with your own hooks or settings; in 0.23 it left every existing file alone.

## 0.23.0

### Minor Changes

- 8b4db39: New projects ship an agent hook (`.claude/hooks/debuff.mjs`, wired up by `.claude/settings.json` for Claude Code and `.codex/hooks.json` for Codex) that checks the agent's edits and commands as it makes them:
  
  - It asks the human before screenshot baselines (including the MCP `run_scenarios` with `update`) or saves change.
  - It refuses edits to `.debuff/`, `dist/` and `node_modules/`, a foreground `npm run dev`, and hand-changed `@debuffjp/*` versions.
  - It warns about new `Math.random`, `Date.now` and real-timer lines in `src/`, which break replays and scenarios.
  - Once per stop, it asks for `debuff test` when `src/` changed since the last run. `debuff test`, `debuff scenario` and the MCP `run_tests` and `run_scenarios` now record their runs in `.debuff/last-test` for this.
  
  The rules come from the installed CLI (`@debuffjp/cli/hook`). The hook does nothing before `npm install`, and `DEBUFF_HOOK=0` turns it off. `debuff doctor` has a new advisory `agent-hooks` check, and `--fix` writes the hook files that are missing without touching existing settings. See debuff.jp/docs/agents#hook.

## 0.22.1

No changes in this release.

## 0.22.0

### Minor Changes

- 0d86d43: Asset ids are typed. `debuff dev`, `debuff build` and `npx debuff assets` write `.debuff/assets.d.ts`, which lists every asset id with its type and preload group, so a misspelt id (`assets.json("levle1")`), an id of the wrong type or an unknown group fails to compile. New templates include the file in `tsconfig.json` and run `debuff build` before `tsc`. In an existing project, add `".debuff/assets.d.ts"` to `include` and run `debuff build` before `tsc`; without the file, ids stay plain strings as before. `AssetId<T>` and `AssetGroup` are exported for your own signatures.

### Patch Changes

- af2583c: The `debuff` agent skill now splits feel and look requests in two. A clear direction ("jump higher", "run faster") gets the change, made through params and measured, with before and after numbers and two alternatives. An open-ended ask ("make it nicer") still gets two or three options before any edit. Before this, the skill told agents to offer options for both.

## 0.21.1

### Patch Changes

- cb68bb7: The `debuff` agent skill now also loads when asked to make the player jump higher or run faster, make the game look nicer, or when `npm test`, a build or a debuff command fails. A new section near the top tells agents not to edit art or feel until the human picks one of two or three options. Before this, agents in the skill eval read the old line ("propose options and let them choose") and redrew the art anyway.
- bc9cfa2: The `debuff` agent skill now loads for everyday work in a debuff project (fixing a bug, tuning feel, adding a mechanic, changing art), not only when starting a new game. Before 0.21.1 its description led with making a new game, and in a skill eval Claude Code never loaded it for those tasks. Run `npx debuff doctor --fix` to update a project's skills.

## 0.21.0

### Minor Changes

- 024d1b1: New projects start as a git repository with one first commit, so every change an agent makes shows as a diff to review or undo. `--no-git` (also on `debuff create`) turns it off; it's skipped when git isn't installed or the folder is already inside a repository, and it never sets a git identity. Projects also get `.vscode/tasks.json` with tasks for the dev server, tests, build and doctor.

## 0.20.0

### Minor Changes

- 4fb20f1: New projects carry agent skills for their own debuff version: `npm create debuff` writes the `debuff`, `debuff-setup`, `keiko` and `myaku` skills into `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, Gemini CLI, Cursor, Copilot), each stamped with `metadata.debuff-version`. `debuff doctor` flags missing or stale skills, and `--fix` rewrites them for the installed version, so an agent's instructions match the code it edits after an upgrade.

### Patch Changes

- b7f1dda: New games keep the canvas hidden until debuff sizes it. Browsers first paint a 300x150 canvas, and its jump to full screen counted as a layout shift (CLS 0.2-0.4 on a desktop window; 0 now).

## 0.19.0

No changes in this release.

## 0.18.0

No changes in this release.

## 0.17.0

### Patch Changes

- ea43c61: `debuff doctor` checks a project's setup in one pass and prints a fix for each problem: Node version, debuff packages on one version, `node_modules` matching `package.json`, a nested copy of `@debuffjp/core`, `@debuffjp/dev` and TypeScript, `debuff.config.ts`, the asset pipeline, `saves.json`, agent files (`AGENTS.md`, `CLAUDE.md`, `.mcp.json`), the browser scenarios use, and a `NODE_ENV` left set in the shell. `--live` also starts the dev server and checks the game exposes its dev hooks. It exits 1 when a required check fails, and `--json` prints every check with an id. The MCP server gains a `doctor` tool, and new projects' `AGENTS.md` lists the command.

## 0.16.0

No changes in this release.

## 0.15.0

### Minor Changes

- bc01ad0: The template picker groups templates into base templates (starting points for your own game) and examples (finished small games). Four new base templates come with pixel art drawn in tenten: `topdown` and `isometric` (a tileset, buff with walk animations, pickups), `sidescroller` (run, jump, one-way planks) and `pointclick` (rooms, hotspots, an inventory, speech). Squish is listed as "Match 3". Templates declare `kind` in `template.json`.

### Patch Changes

- 7dbe21a: The templates' agent guide says what `inspect()` is for: it is all that tests, scenarios, fuzzing, replay diffs and agents can see of the game, so report what a player reacts to as lists of positions, not counts, cap large lists, and name the camera or board transform plainly. It also points games whose logic awaits something at `await game.run()` instead of `wait()`.

## 0.14.0

No changes in this release.

## 0.13.3

No changes in this release.

## 0.13.2

No changes in this release.

## 0.13.1

No changes in this release.

## 0.13.0

No changes in this release.

## 0.12.0

No changes in this release.

## 0.11.0

### Minor Changes

- 4074fea: Saves survive game updates (ADR 0014). `Storage` uses a saved field only if its JSON type matches the default's, so a save from an older version of the game can't break it (the original is kept once under `<key>:backup`). `new Storage(key, defaults, { version, migrate })` upgrades older saves once. `debuff build` finds every save, compares it with `saves.json` (committed, like a lockfile), fails if a save key disappears and warns when a field's type changes without a version bump; `--accept-saves` records intended changes. `debuff inspect` and the MCP `build` tool include saves, and the templates ship a `saves.json`.

## 0.10.0

### Minor Changes

- 698f6f0: The basic template turns on `typecheck` in its `debuff.config.ts`, so new games see type errors in the dev overlay.

## 0.9.5

No changes in this release.

## 0.9.4

No changes in this release.

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
