# @debuffjp/dev

## 0.8.0

No changes in this release.

## 0.7.1

No changes in this release.

## 0.7.0

### Patch Changes

- 4798506: Dev overlay polish: buff alone in the header, rectangle slider handles over whole segments, a pixel speed picker, debuff sans param names, centred labels, the active tab opening into the panel, quieter group headers, outline off-toggles, a `–`/`+` collapse button and an 8px rhythm.

## 0.6.0

### Minor Changes

- 5a34826: The dev overlay has its own look: chamfered panels, keycap buttons that flash on click, segmented sliders, stack-style param groups and status chips. The styles are a small class-based kit, injected once and scoped to the overlay.

### Patch Changes

- 6b0ff8a: debuff sans everywhere: the splash's "made with" line and the dev overlay's labels (title, buttons, tabs, chips, param groups) use it. Longer readouts stay monospace for legibility.

## 0.5.1

No changes in this release.

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

- Updated dependencies [4cc2ff5]
  - myaku@0.2.0

## 0.4.0

### Minor Changes

- 771ec97: New package: myaku, a frame profiler for web games. It finds the frames players feel drop and explains each one (script with its location, GC, GPU uploads, shader compiles, layout, browser throttling), for any engine. `@debuffjp/dev` starts it with debuff's update and render as spans and adds `profile()`; the MCP server adds `game_profile`, and the explain-stutter prompt uses it.

### Patch Changes

- Updated dependencies [c49aac3]
- Updated dependencies [771ec97]
- Updated dependencies [b8f2649]
  - myaku@0.1.0

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- 91f7088: `__DEBUFF_DEV__.state()` reports `step`, the seconds per fixed simulation step.

## 0.2.0

### Minor Changes

- 5642db8: New: deterministic replays. With `devTools({ input })`, the dev tools record every key, pointer and param change from page load. The overlay's log tab has "save replay" and "copy replay", `window.__DEBUFF_DEV__.replay(toTick?)` returns one, and the MCP server's `game_replay` tool saves one to `.debuff/replays/`. A replay is a scenario, so `debuff scenario <file>` plays the session back exactly. Pass a note's tick to reproduce what the human saw when they flagged it. Anything a replay can't reproduce, such as slow motion, is listed in `warnings`.
- 0bf6f5b: Scenarios can run game commands: register them with `devTools({ input, commands: { warp: (to) => ... } })` and call them with `{ "command": "warp", "args": ["hollow"] }`, so a scenario can start at a checkpoint without test-only code in the game. Commands are recorded in replays. `debuff scenario --update` now rewrites only baselines that changed. `debuff fuzz` samples state during long holds and reports `loop` findings when a state field keeps flipping between two values with input unchanged, such as stairs that send the player straight back.

### Patch Changes

- 95cfe26: New `@debuffjp/ui` package: `Transition` (fade out, swap, fade in), `Menu` (keyboard, gamepad and touch navigation through input actions) and `panel` (framed boxes). No dependencies. The dev overlay now attributes errors in it to debuff.

## 0.1.0

### Minor Changes

- 9d71ad0: Agents can now work on the game you have open. `debuff dev` relays agent commands to the page over Server-Sent Events, and `game_start` in `@debuffjp/mcp` attaches to that live tab when one is open (otherwise it falls back to a headless copy). The overlay shows an agent badge and logs the agent's actions, which you can undo. New MCP tools: `game_pause`, `game_frames` (per-frame breakdown) and `game_notes` (moments you flagged in the overlay). The WebGL2 draw-call count now includes the pending batch.
- 38d968c: Dev tools can now pause the game and explain slow frames. The overlay gains pause, step, slow-motion and "pause on spike" controls. Its frame graph breaks each frame into update and render time, and you can click a red bar to inspect that frame (steps, quads, draw calls, long tasks) with a plain-words diagnosis. You can flag moments as notes for agents. An activity log, with undo, shows who changed what: you, an agent or a scenario. Dev hooks v2 adds `pause`, `resume`, `speed`, `frames` and `notes`. Core counts `draw.quads` and `draw.drawCalls` per frame.
- f807f89: Errors are now explained, and a crash no longer freezes the game.
  
  - **Core:** an exception in `update` or `render` used to kill the requestAnimationFrame loop while the game still reported itself as running, so `start()` couldn't recover it. Now the loop stops cleanly and records `game.lastError` (phase, scene and tick). It emits the new `hooks.error` and rethrows the error so the console still shows it. `start()` resumes.
  - **Dev tools:** each error is labelled with whose problem it is: your code, a call debuff rejected, a debuff bug (with a prefilled report link) or something outside the game. It shows the source-mapped line, which opens in your editor, plus a plain-words hint. Repeats are counted. `errors()` and MCP `game_errors` return the same structure.
- 518b6d5: You can collapse the dev overlay to a single header bar with fps and the agent badge, using the ▾ button or a double-click on the header. The overlay remembers the state across reloads, and the frame graph stops drawing while collapsed.
- 29f6743: Redesigned the dev overlay. It now has a toolbar (pause, step, speed, snap, restart) and four tabs: perf, tune, state and log.
  
  - **perf**: frames are coloured by health, and a summary shows headroom and whether dropped frames came from the game or from outside it. Normal display jitter is no longer reported as a problem.
  - **tune**: changed values are marked, you can double-click a name to reset it, and "copy changes" copies only what you tuned.
  - **state**: shows the scene's `inspect()` data live.
  - **log**: errors get a header badge.
  
  Arrow keys on a focused slider no longer drive the game. New exports: `summarize` and `HITCH`. The dev hooks' `errors()` now come from the shared session.
- 27118f8: Runtime plugin contract (ADR 0004, phase 1).
  
  - New: `game.use(plugin)`, `game.plugins`, `game.hooks` (`beforeUpdate`, `afterUpdate`, `beforeRender`, `afterRender`, `sceneChange`) and `game.inspect.register(name, provider)`.
  - New: `devTools(options)` plugin in `@debuffjp/dev`. `exposeDevHooks` is now shorthand for `game.use(devTools(options))`. `state()` adds `pluginNames` and `plugins`.
  - **Breaking:** `game.afterUpdate(fn)` is replaced by `game.hooks.afterUpdate(fn)`. `Input`'s host now needs `hooks.afterUpdate`; passing a `Game` works unchanged.
- f50defb: Batched WebGL2 renderer behind a new `draw` API (ADR 0007).
  
  - New: `game.draw` with `sprite`, `rect`, `circle`, `line`, `text`, a transform stack, `withCamera`, `blend`, `alpha` and `raw`. It uses WebGL2 instanced, multi-texture batching with an automatic Canvas 2D fallback (`renderer: "auto" | "webgl2" | "2d"`), and sustains about 200k sprites at 60 fps on the renderer benchmark.
  - **Breaking:** `Scene.render(ctx)` becomes `Scene.render(draw)`, and render hooks receive `draw`. `game.ctx` is removed. `camera.apply(ctx)` is replaced by `draw.withCamera(camera, fn)` (`camera.view()` returns the matrix). `Sprite.draw`, `Particles.draw` and `Trail.draw` take `draw`.
  - New: `game.redraw()`, `renderer` in the dev state, and `@debuffjp/cli/client` types.

### Patch Changes

- 85ad1d7: The overlay's agent badge now stays on for as long as an agent is attached, not just for 30 seconds after its last action. It turns off when the agent stops or its process exits, and the activity log records "agent disconnected".
- c4fe419: Branded tooling: buff appears as terminal pixel art in CLI headers and reacts to results (happy or oops). A lime palette with sky, pink, amber and violet accents colours CLI output. The dev overlay gets a live buff that blinks and looks worried on frame spikes, a colour-coded FPS chip and accent-coloured param groups.
- 71b6dd3: The brand lime is now `#cffb2d`, the Debuff Foundation colour. Its tints are rebuilt around it, and the change covers the splash, the dev panel, the CLI colours, the templates and the art.
- a4f2549: Fixed pointer input throwing on every mouse move. `Input` passed `game.toLogical` without its `this`, so the method failed. `toLogical` is now bound, and `Input` calls it through the host. Repeats of a source-mapped error now count as one entry instead of filling the error list. We found both through the MCP server's `game_errors`, and the dev tools labelled the first one as a debuff bug.
