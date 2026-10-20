# @debuffjp/mcp

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
