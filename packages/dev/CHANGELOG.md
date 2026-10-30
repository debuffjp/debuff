# @debuffjp/dev

## 0.24.0

No changes in this release.

## 0.23.0

No changes in this release.

## 0.22.1

No changes in this release.

## 0.22.0

No changes in this release.

## 0.21.1

No changes in this release.

## 0.21.0

No changes in this release.

## 0.20.0

### Patch Changes

- c3f1aef: The collapsed dev overlay shrinks to fit its header (buff, badges, fps and the expand button) instead of keeping the full 290 px panel width.

## 0.19.0

No changes in this release.

## 0.18.0

No changes in this release.

## 0.17.0

### Patch Changes

- 77f659e: The `luminance` dev hook, which the `flashes` and `contrast` scenario checks read, now averages every pixel in each cell itself. It used to shrink the frame with `drawImage`, which point-samples on macOS, so fine detail scrolling past (the topdown template's grass) failed the flash check there and nowhere else.

## 0.16.0

### Minor Changes

- efec916: The dev hooks' `pointerDown(x, y, kind?)` and `tap(x, y, kind?)` take what is pressing: `"mouse"` (the default, as before), `"touch"` or `"pen"`. The game sees it in `pointer.kind`. A touch or pen press is contact 1 in `pointer.touches` and the primary pointer, and a mouse press is only the primary pointer, so a dev drag no longer looks like both a mouse and a touch. Scenarios take `{ "pointerDown": [x, y, "touch"] }` and `{ "tap": [x, y, "pen"] }`, and keiko's `game.pointerDown(x, y, "touch")` does the same, through the dev hooks or as real touch events.
- 96bebe8: The right and middle mouse buttons are bindable: `"PointerRight"` and `"PointerMiddle"`, so an action like right-click remove goes through `input.down/pressed/released`, scenarios and fuzz like any key. `input.pointer.right` and `input.pointer.middle` hold `down`, `pressed` and `released`, including buttons pressed while another is held; `pointer.pressButton("right")` and `releaseButton` simulate them. The dev hooks' `press("PointerRight")`, scenario `{ "press": "PointerRight" }` and `debuff fuzz --keys PointerRight` press the button, and recorded replays keep it. The primary pointer (`"Pointer"`) is unchanged.
- 8e669fe: Tests and scenarios can press the right mouse button, scroll the wheel and touch with several fingers, all through the same paths as real input.
  
  - keiko: `game.press("PointerRight")` (and `"PointerMiddle"`), `game.wheel(dy, dx?)`, and `game.touchDown(id, x, y)`, `touchMove(id, x, y)` and `touchUp(id)`. debuff games are driven through their dev hooks. Other games get real DOM events: mouse button presses (a button pressed while another is held arrives as a `pointermove`, as in browsers, and the right button fires `contextmenu`), `wheel` events, and `pointerType: "touch"` pointer events with touch events. `game.replay()` plays the new scenario steps.
  - Dev hooks: `wheel(dy, dx?)`, `touchDown(id, x, y, kind?)`, `touchMove(id, x, y)` and `touchUp(id)`. Recorded replays keep wheel scrolls and touches, so a session played on a phone replays exactly. They need `@debuffjp/input` 0.16 and say so on older versions.
  - Scenarios: `{ "wheel": dy }` or `{ "wheel": [dy, dx] }`, `{ "touchDown": [id, x, y] }` (`[id, x, y, "pen"]` for a pen), `{ "touchMove": [id, x, y] }` and `{ "touchUp": id }`.

### Patch Changes

- Updated dependencies [70a00c9]
  - myaku@0.5.1

## 0.15.0

### Minor Changes

- 7dbe21a: The dev overlay stays out of automated runs and out of game state. In automated browsers (`navigator.webdriver`, as under scenario runs and agent harnesses) it now starts hidden, so it no longer sits in every screenshot or catches taps meant for the game's corner; the toggle key still shows it, and `devOverlay({ open: true })` keeps it visible. `state().plugins` leaves out debuff's own tools (providers named `dev-*`, such as the overlay's panel state), so harnesses that diff state see only the game.

## 0.14.0

### Minor Changes

- ca6ba6a: `state()` adds `camera` (centre, zoom and view size in world units) so external harnesses can place `inspect()` rows in the view.

## 0.13.3

No changes in this release.

## 0.13.2

No changes in this release.

## 0.13.1

No changes in this release.

## 0.13.0

No changes in this release.

## 0.12.0

### Minor Changes

- c6311a2: Agent tooling from building gloop:
  
  - MCP: new `game_command` tool runs a game's dev command by name with JSON args. `game_start` takes `viewport: [w, h]` (headless) and `reducedMotion` to force it on or off. `game_frames` takes `summary` (percentiles and the 3 slowest frames), `game_step` takes `quiet` (no inspect state), and `game_capture` takes `path` to save the PNG in the project. `game_profile` in headless mode now says profiling needs live mode instead of blaming requestAnimationFrame.
  - dev: `state()` reports the logical `width`/`height`, and `reducedMotion` and `reducedMotionForced`; new `reducedMotion(value | null)` hook forces it.
  - core: `Random#state` gets and sets the generator's state, for undo and replays.
  - keiko: `toBeLessThan` / `toBeGreaterThan` matchers; docs say `-t` is a case-insensitive substring match and point async game logic at `run()` / `settle()` instead of `wait()`.
  - MCP: headless errors are now just the message (no `page.evaluate:` prefix or stack).
  - MCP, scenarios and dev: calling a hook an older `@debuffjp/dev` doesn't have now says to update it, instead of "is not a function".

## 0.11.0

No changes in this release.

## 0.10.0

### Minor Changes

- ea6a86a: Type errors while you play: set `typecheck: true` in `debuff.config.ts` and `debuff dev` type-checks with your project's own `tsc` after every save. Type errors show as a badge and cards in the dev overlay (the game keeps running), in `window.__DEBUFF_DEV__.typeErrors()`, and to agents through the new `typecheck` MCP tool, which also works without a browser.

## 0.9.5

No changes in this release.

## 0.9.4

No changes in this release.

## 0.9.3

No changes in this release.

## 0.9.2

### Patch Changes

- cc424e9: Gamepad input is now recorded, so rewind, the reload that keeps your place, and replays saved as scenarios reproduce pad sessions. Scenarios gain a `pad` step.
- Updated dependencies [f29a0f0]
- Updated dependencies [f739c4a]
- Updated dependencies [d224bda]
  - myaku@0.5.0

## 0.9.1

### Patch Changes

- Updated dependencies [c2d6ed6]
- Updated dependencies [4dfc682]
  - myaku@0.4.0

## 0.9.0

### Minor Changes

- d159eef: The "squish" look everywhere:
  
  - **ui:** panels and menus that set no frame of their own get round corners, no outline, light labels, lime focus and a jelly highlight that squashes when focus moves (`debuffFrame` is this look; `FrameStyle.radius` is new). Styles that set their own borders or fill are untouched.
  - **dev panel:** soft rounded panel, pill buttons and tabs, controls that squash on press, round toggles and sliders.
  - **CLI:** buff is flat with dot eyes, and squashes when a command succeeds.
  - **basic template:** buff is a flat jelly block with pill eyes, little feet, an idle jiggle and a hop on pop.

### Patch Changes

- Updated dependencies [a761975]
- Updated dependencies [d4a6c44]
- Updated dependencies [cfa9fff]
  - myaku@0.3.0

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
