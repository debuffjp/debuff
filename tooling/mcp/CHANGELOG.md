# @debuffjp/mcp

## 0.24.0

### Minor Changes

- 30416ac: New: `debuff papercut` and the MCP tool `report_papercut` report tooling friction (a slow or flaky tool, a missing API, confusing docs) to the public board at papercuts.debuff.jp. They show close matches first, so a repeat adds a hit with your minutes instead of a duplicate. Nothing is sent unless you run them, and only the text you wrote goes.
  
  The CLI and MCP server also report debuff's own papercuts: a setup failure seen twice in a week, or a command or tool call far slower than it should be. They send a fixed title, an error code, minutes and the version, at most once a day per problem. Off with `debuff papercuts off`, `DEBUFF_PAPERCUTS=0` or `DEBUFF_TELEMETRY=0`, and skipped in CI.

### Patch Changes

- Updated dependencies [10ad79d]
- Updated dependencies [30416ac]
  - @debuffjp/cli@0.24.0

## 0.23.0

### Minor Changes

- 8b4db39: New projects ship an agent hook (`.claude/hooks/debuff.mjs`, wired up by `.claude/settings.json` for Claude Code and `.codex/hooks.json` for Codex) that checks the agent's edits and commands as it makes them:
  
  - It asks the human before screenshot baselines (including the MCP `run_scenarios` with `update`) or saves change.
  - It refuses edits to `.debuff/`, `dist/` and `node_modules/`, a foreground `npm run dev`, and hand-changed `@debuffjp/*` versions.
  - It warns about new `Math.random`, `Date.now` and real-timer lines in `src/`, which break replays and scenarios.
  - Once per stop, it asks for `debuff test` when `src/` changed since the last run. `debuff test`, `debuff scenario` and the MCP `run_tests` and `run_scenarios` now record their runs in `.debuff/last-test` for this.
  
  The rules come from the installed CLI (`@debuffjp/cli/hook`). The hook does nothing before `npm install`, and `DEBUFF_HOOK=0` turns it off. `debuff doctor` has a new advisory `agent-hooks` check, and `--fix` writes the hook files that are missing without touching existing settings. See debuff.jp/docs/agents#hook.

### Patch Changes

- Updated dependencies [8b4db39]
- Updated dependencies [6fe654d]
  - @debuffjp/cli@0.23.0

## 0.22.1

### Patch Changes

- @debuffjp/cli@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [0d86d43]
  - @debuffjp/cli@0.22.0

## 0.21.1

### Patch Changes

- @debuffjp/cli@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [dbb1861]
- Updated dependencies [024d1b1]
- Updated dependencies [6b1c064]
- Updated dependencies [6b68789]
  - @debuffjp/cli@0.21.0

## 0.20.0

### Minor Changes

- 06e2494: A failure contract for scripts and agents. The exit code says what to do next: 1 a run reported a failure, 2 setup needs fixing (run `debuff doctor`; `doctor` itself now exits 2 when a required check fails), 3 bad input. With `--json`, stdout carries exactly one JSON document, and a command that can't run prints `{ "error": { "code", "message", "fix", "transient" } }` with a stable `code`. Unknown options are now an error instead of being ignored, and `scenario --json` no longer prints a log line before its JSON. MCP tool errors carry the same code and fix.

### Patch Changes

- Updated dependencies [06e2494]
- Updated dependencies [4fb20f1]
  - @debuffjp/cli@0.20.0

## 0.19.0

### Patch Changes

- @debuffjp/cli@0.19.0

## 0.18.0

### Patch Changes

- c7efeba: `debuff doctor --fix` applies the safe fixes it finds: install, dedupe, adding `@debuffjp/dev`, and writing a missing `.mcp.json`, in the project's package manager. Commands that fail on setup now end with a pointer to `debuff doctor`. The MCP server's instructions get a missing space back.
- Updated dependencies [c7efeba]
  - @debuffjp/cli@0.18.0

## 0.17.0

### Minor Changes

- ea43c61: `debuff doctor` checks a project's setup in one pass and prints a fix for each problem: Node version, debuff packages on one version, `node_modules` matching `package.json`, a nested copy of `@debuffjp/core`, `@debuffjp/dev` and TypeScript, `debuff.config.ts`, the asset pipeline, `saves.json`, agent files (`AGENTS.md`, `CLAUDE.md`, `.mcp.json`), the browser scenarios use, and a `NODE_ENV` left set in the shell. `--live` also starts the dev server and checks the game exposes its dev hooks. It exits 1 when a required check fails, and `--json` prints every check with an id. The MCP server gains a `doctor` tool, and new projects' `AGENTS.md` lists the command.

### Patch Changes

- Updated dependencies [ea43c61]
  - @debuffjp/cli@0.17.0

## 0.16.0

### Minor Changes

- fead3cd: `game_input` gains `wheel` (`dy`, `dx`), `touch_down` / `touch_move` / `touch_up` (by contact `id`, with `kind: "pen"` for a pen), and a `kind` on `tap` and `pointer_down`.

### Patch Changes

- Updated dependencies [efec916]
- Updated dependencies [e17b3df]
- Updated dependencies [96bebe8]
- Updated dependencies [812b958]
- Updated dependencies [068ed32]
- Updated dependencies [70a00c9]
- Updated dependencies [b87c265]
- Updated dependencies [8e669fe]
  - @debuffjp/cli@0.16.0
  - keiko@0.7.0

## 0.15.0

### Patch Changes

- @debuffjp/cli@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [7bf806f]
- Updated dependencies [3e03829]
  - @debuffjp/cli@0.14.0

## 0.13.3

### Patch Changes

- @debuffjp/cli@0.13.3

## 0.13.2

### Patch Changes

- @debuffjp/cli@0.13.2

## 0.13.1

### Patch Changes

- @debuffjp/cli@0.13.1

## 0.13.0

### Patch Changes

- @debuffjp/cli@0.13.0

## 0.12.0

### Minor Changes

- c6311a2: Agent tooling from building gloop:
  
  - MCP: new `game_command` tool runs a game's dev command by name with JSON args. `game_start` takes `viewport: [w, h]` (headless) and `reducedMotion` to force it on or off. `game_frames` takes `summary` (percentiles and the 3 slowest frames), `game_step` takes `quiet` (no inspect state), and `game_capture` takes `path` to save the PNG in the project. `game_profile` in headless mode now says profiling needs live mode instead of blaming requestAnimationFrame.
  - dev: `state()` reports the logical `width`/`height`, and `reducedMotion` and `reducedMotionForced`; new `reducedMotion(value | null)` hook forces it.
  - core: `Random#state` gets and sets the generator's state, for undo and replays.
  - keiko: `toBeLessThan` / `toBeGreaterThan` matchers; docs say `-t` is a case-insensitive substring match and point async game logic at `run()` / `settle()` instead of `wait()`.
  - MCP: headless errors are now just the message (no `page.evaluate:` prefix or stack).
  - MCP, scenarios and dev: calling a hook an older `@debuffjp/dev` doesn't have now says to update it, instead of "is not a function".

### Patch Changes

- Updated dependencies [c6311a2]
  - keiko@0.6.0
  - @debuffjp/cli@0.12.0

## 0.11.0

### Minor Changes

- 4074fea: Saves survive game updates (ADR 0014). `Storage` uses a saved field only if its JSON type matches the default's, so a save from an older version of the game can't break it (the original is kept once under `<key>:backup`). `new Storage(key, defaults, { version, migrate })` upgrades older saves once. `debuff build` finds every save, compares it with `saves.json` (committed, like a lockfile), fails if a save key disappears and warns when a field's type changes without a version bump; `--accept-saves` records intended changes. `debuff inspect` and the MCP `build` tool include saves, and the templates ship a `saves.json`.

### Patch Changes

- Updated dependencies [4074fea]
  - @debuffjp/cli@0.11.0

## 0.10.0

### Minor Changes

- ea6a86a: Type errors while you play: set `typecheck: true` in `debuff.config.ts` and `debuff dev` type-checks with your project's own `tsc` after every save. Type errors show as a badge and cards in the dev overlay (the game keeps running), in `window.__DEBUFF_DEV__.typeErrors()`, and to agents through the new `typecheck` MCP tool, which also works without a browser.

### Patch Changes

- Updated dependencies [ea6a86a]
  - @debuffjp/cli@0.10.0

## 0.9.5

### Patch Changes

- @debuffjp/cli@0.9.5

## 0.9.4

### Patch Changes

- @debuffjp/cli@0.9.4

## 0.9.3

### Patch Changes

- @debuffjp/cli@0.9.3

## 0.9.2

### Patch Changes

- Updated dependencies [c2a9cfa]
- Updated dependencies [7c2ee14]
- Updated dependencies [cc424e9]
- Updated dependencies [1754dac]
- Updated dependencies [97deedd]
  - @debuffjp/cli@0.9.2
  - keiko@0.5.1

## 0.9.1

### Patch Changes

- @debuffjp/cli@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [d4a6c44]
- Updated dependencies [a9b440f]
- Updated dependencies [a761975]
- Updated dependencies [cfa9fff]
- Updated dependencies [61798e2]
  - keiko@0.5.0
  - @debuffjp/cli@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [0f12c4b]
- Updated dependencies [77fe8c6]
- Updated dependencies [5504289]
  - @debuffjp/cli@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [1d8036c]
  - @debuffjp/cli@0.7.1

## 0.7.0

### Patch Changes

- @debuffjp/cli@0.7.0

## 0.6.0

### Patch Changes

- @debuffjp/cli@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [444da77]
- Updated dependencies [a586450]
  - keiko@0.4.1
  - @debuffjp/cli@0.5.1

## 0.5.0

### Minor Changes

- 60fd560: New: rewind. The dev panel's log tab has a timeline slider: drag to any tick of the session and the page reloads, replays your inputs to that tick (without drawing, so it's quick) and pauses there with the game's exact state. You can drag forward again until you play on from the earlier point. Agents can do the same with the MCP `game_rewind` tool, for example at a note's tick, and games with `window.__DEBUFF_DEV__.rewind(tick)`.
  
  **save as scenario** in the panel writes the session so far to `scenarios/<name>.json` through `debuff dev`, with a capture at the end, so a bug you just played becomes a regression test.
  
  `game.step(steps, false)` advances without drawing.

### Patch Changes

- 27dce10: `@debuffjp/mcp` declares `mcpName: "jp.debuff/debuff"` for the official MCP Registry.
- Updated dependencies [c0236d6]
- Updated dependencies [437f2ac]
- Updated dependencies [446c446]
- Updated dependencies [1f17bac]
- Updated dependencies [60fd560]
- Updated dependencies [28b3d48]
  - @debuffjp/cli@0.5.0
  - keiko@0.4.0

## 0.4.0

### Minor Changes

- 771ec97: New package: myaku, a frame profiler for web games. It finds the frames players feel drop and explains each one (script with its location, GC, GPU uploads, shader compiles, layout, browser throttling), for any engine. `@debuffjp/dev` starts it with debuff's update and render as spans and adds `profile()`; the MCP server adds `game_profile`, and the explain-stutter prompt uses it.

### Patch Changes

- Updated dependencies [27d109a]
  - keiko@0.3.1
  - @debuffjp/cli@0.4.0

## 0.3.3

### Patch Changes

- Updated dependencies [3da761c]
  - keiko@0.3.0
  - @debuffjp/cli@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [28f9d49]
  - keiko@0.2.0
  - @debuffjp/cli@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [d359aa1]
  - keiko@0.1.1
  - @debuffjp/cli@0.3.1

## 0.3.0

### Minor Changes

- 91f7088: New `run_tests` tool runs the project's keiko logic tests; failures carry the tick, scene and state where they broke. The `add-mechanic`, `fix-errors` and `tune-feel` prompts now ask for a logic test.

### Patch Changes

- 97c44ec: Every tool now declares `readOnlyHint` or `destructiveHint`, so MCP clients and directories can tell which tools change things. None of them are destructive.
- Updated dependencies [01c7c17]
- Updated dependencies [1f5fb28]
  - @debuffjp/cli@0.3.0

## 0.2.0

### Minor Changes

- 23edf1a: Built-in guidance for coding agents:
  
  - **MCP prompts:** `playtest`, `fix-errors`, `tune-feel`, `add-mechanic` and `explain-stutter` are step-by-step workflows built from the server's tools. They show up as slash commands in clients like Claude Code, and each keeps creative calls with the human.
  - **New projects** include an `AGENTS.md` (commands, layout, work loop and rules) and a `CLAUDE.md` that points to it, so agents start with the right context.
- f300156: New: `debuff fuzz` plays your game headlessly with random but plausible input: movement keys held, action keys tapped. It reports runtime errors, explained and source-mapped, and stuck states where the scene's `inspect()` stops changing.
  
  Each finding is saved as a scenario in `.debuff/fuzz/` that replays it exactly, because debuff's fixed steps and seeded RNG make runs deterministic. Run `debuff scenario <file>` to reproduce a bug, and again after the fix to verify it. The same `--seed` repeats a run, and the command exits non-zero on errors, so it can gate CI. The MCP server exposes it as the `fuzz` tool, and new projects' `AGENTS.md` tells agents to use it.
- 5642db8: New: deterministic replays. With `devTools({ input })`, the dev tools record every key, pointer and param change from page load. The overlay's log tab has "save replay" and "copy replay", `window.__DEBUFF_DEV__.replay(toTick?)` returns one, and the MCP server's `game_replay` tool saves one to `.debuff/replays/`. A replay is a scenario, so `debuff scenario <file>` plays the session back exactly. Pass a note's tick to reproduce what the human saw when they flagged it. Anything a replay can't reproduce, such as slow motion, is listed in `warnings`.

### Patch Changes

- cbb7ecc: Bin paths are now written as `bin/x.js` instead of `./bin/x.js`. npm 11 treats the `./` form as invalid and strips the command, which would have left `debuff`, `debuff-mcp` and `npm create debuff` with nothing to run.
- 9f96ee5: First-run fixes: official templates download from the git tag of the create-debuff release instead of main; unknown CLI commands print "unknown command: X" and exit 1; a capture mismatch prints the actual, baseline and diff image paths (a diff image is now written) and how to accept the change; MCP `root` descriptions say absolute paths work.
- 0bf6f5b: Scenarios can run game commands: register them with `devTools({ input, commands: { warp: (to) => ... } })` and call them with `{ "command": "warp", "args": ["hollow"] }`, so a scenario can start at a checkpoint without test-only code in the game. Commands are recorded in replays. `debuff scenario --update` now rewrites only baselines that changed. `debuff fuzz` samples state during long holds and reports `loop` findings when a state field keeps flipping between two values with input unchanged, such as stairs that send the player straight back.
- Updated dependencies [cbb7ecc]
- Updated dependencies [9f96ee5]
- Updated dependencies [f300156]
- Updated dependencies [7c90762]
- Updated dependencies [0bf6f5b]
  - @debuffjp/cli@0.2.0

## 0.1.0

### Minor Changes

- 9d71ad0: Agents can now work on the game you have open. `debuff dev` relays agent commands to the page over Server-Sent Events, and `game_start` in `@debuffjp/mcp` attaches to that live tab when one is open (otherwise it falls back to a headless copy). The overlay shows an agent badge and logs the agent's actions, which you can undo. New MCP tools: `game_pause`, `game_frames` (per-frame breakdown) and `game_notes` (moments you flagged in the overlay). The WebGL2 draw-call count now includes the pending batch.
- f807f89: Errors are now explained, and a crash no longer freezes the game.
  
  - **Core:** an exception in `update` or `render` used to kill the requestAnimationFrame loop while the game still reported itself as running, so `start()` couldn't recover it. Now the loop stops cleanly and records `game.lastError` (phase, scene and tick). It emits the new `hooks.error` and rethrows the error so the console still shows it. `start()` resumes.
  - **Dev tools:** each error is labelled with whose problem it is: your code, a call debuff rejected, a debuff bug (with a prefilled report link) or something outside the game. It shows the source-mapped line, which opens in your editor, plus a plain-words hint. Repeats are counted. `errors()` and MCP `game_errors` return the same structure.
- 155638d: New `@debuffjp/mcp`: an MCP server with project tools (`inspect_project`, `list_assets`, `build`, `run_scenarios`) and live-game tools (`game_start`, `game_step`, `game_input`, `game_state`, `game_params`, `game_set_param`, `game_capture`, `game_errors`, `game_stop`). Templates include `.mcp.json`. `@debuffjp/cli` exports `inspectProject`, `launchBrowser`, `callHook` and `hooksReady`.

### Patch Changes

- 85ad1d7: The overlay's agent badge now stays on for as long as an agent is attached, not just for 30 seconds after its last action. It turns off when the agent stops or its process exits, and the activity log records "agent disconnected".
- 1487920: Automatic texture atlases. The asset pipeline packs PNGs per preload group into atlases (MaxRects, lossless, padded and edge-extruded), in dev and builds, cached by content hash. It's on by default; configure with `assets.atlas` in `debuff.config.ts` (`maxSize`, `padding`, `exclude`, or `false`).
  
  - `@debuffjp/assets`: new `frame(id)` and `frames(id)` work for atlased and standalone images, and assets sharing an atlas share one request. `image(id)` explains what to use for atlased assets.
  - `@debuffjp/tilemap`: tilesets accept an atlas region (`assets.frame(id)`).
- Updated dependencies [9d71ad0]
- Updated dependencies [85ad1d7]
- Updated dependencies [1487920]
- Updated dependencies [c4fe419]
- Updated dependencies [155638d]
- Updated dependencies [ec06222]
- Updated dependencies [71c6b6e]
- Updated dependencies [451831a]
- Updated dependencies [b25d482]
- Updated dependencies [f50defb]
  - @debuffjp/cli@0.1.0
