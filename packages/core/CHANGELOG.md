# @debuffjp/core

## 0.11.0

### Minor Changes

- 4074fea: Saves survive game updates (ADR 0014). `Storage` uses a saved field only if its JSON type matches the default's, so a save from an older version of the game can't break it (the original is kept once under `<key>:backup`). `new Storage(key, defaults, { version, migrate })` upgrades older saves once. `debuff build` finds every save, compares it with `saves.json` (committed, like a lockfile), fails if a save key disappears and warns when a field's type changes without a version bump; `--accept-saves` records intended changes. `debuff inspect` and the MCP `build` tool include saves, and the templates ship a `saves.json`.

### Patch Changes

- Updated dependencies [30ff49d]
  - spryte@0.2.3

## 0.10.0

### Patch Changes

- Updated dependencies [2e71515]
- Updated dependencies [33d6a29]
  - spryte@0.2.2

## 0.9.5

### Patch Changes

- Updated dependencies [984a0eb]
  - spryte@0.2.1

## 0.9.4

### Patch Changes

- Updated dependencies [68dec64]
- Updated dependencies [3d1f9e2]
- Updated dependencies [1ca1155]
- Updated dependencies [6bc9e5d]
  - spryte@0.2.0

## 0.9.3

### Patch Changes

- Updated dependencies [3a328dd]
  - spryte@0.1.2

## 0.9.2

No changes in this release.

## 0.9.1

### Patch Changes

- Updated dependencies [247d5a4]
  - spryte@0.1.1

## 0.9.0

### Minor Changes

- 67d406b: The renderer now lives in its own package, [spryte](https://www.npmjs.com/package/spryte), which core depends on and re-exports. Game code is unchanged. Also: texture coordinates are `highp` (fixes off-by-a-texel sampling in large atlases on some mobile GPUs), drawing one image both smooth and pixelated no longer re-uploads it, and `game.dispose()` frees every GPU object. New: `draw.font` sets the default font for `draw.text` (debuff sans in games).

## 0.8.0

No changes in this release.

## 0.7.1

### Patch Changes

- 1d8036c: - **Camera:** a followed sprite no longer shimmies a pixel while it moves. `Camera.view()` stops rounding its offset, and `Draw` snaps each sprite once, after the camera.
  - **Scenario `contrast`:** samples one cell per logical pixel (up to 1024 a side) instead of averaging regions wider than 256 px, and compares the background with the text on it, so short labels in big boxes and 1-pixel pixel-font strokes are judged correctly.
  - **`debuff fuzz`:** a loop now needs the scene, or two state fields, flipping together; a single counter rising and falling (bullets, particles) no longer counts. `--ignore <paths>` skips noisy fields.

## 0.7.0

### Patch Changes

- 4798506: The splash's "made with" line is one scale step smaller.

## 0.6.0

### Minor Changes

- 22157f7: `draw.text` and menus now default to **debuff sans**, a built-in pixel font (printable ASCII, 5x7 capitals, proportional), instead of the browser's `8px monospace`. `debuffSans()` returns it as a `BitmapFont`. Pass `font: "8px monospace"` to keep the old look.

### Patch Changes

- 6b0ff8a: debuff sans everywhere: the splash's "made with" line and the dev overlay's labels (title, buttons, tabs, chips, param groups) use it. Longer readouts stay monospace for legibility.

## 0.5.1

No changes in this release.

## 0.5.0

### Minor Changes

- 60fd560: New: rewind. The dev panel's log tab has a timeline slider: drag to any tick of the session and the page reloads, replays your inputs to that tick (without drawing, so it's quick) and pauses there with the game's exact state. You can drag forward again until you play on from the earlier point. Agents can do the same with the MCP `game_rewind` tool, for example at a note's tick, and games with `window.__DEBUFF_DEV__.rewind(tick)`.
  
  **save as scenario** in the panel writes the session so far to `scenarios/<name>.json` through `debuff dev`, with a capture at the end, so a bug you just played becomes a regression test.
  
  `game.step(steps, false)` advances without drawing.
- 28b3d48: New: assertions on what happens in the game, not on pixels.
  
  - `game.emit("coin", detail?)` marks a game event. The dev tools count events by name in `state().events`, and `__DEBUFF_DEV__.events()` lists the latest with their tick and detail.
  - Scenarios have an `until` step: `{ "until": { "events.coin": { "gte": 1 } }, "within": 60 }` steps one tick at a time until the conditions hold, and fails with the actual values if they don't. Use it instead of guessing a `wait`. `expect` and `until` read `events.<name>` as 0 until the first emit.
  - keiko replays `until` steps and adds `game.emitted("coin")`.
  - New projects' `AGENTS.md` tells agents to prefer state and event assertions over screenshots, and the platformer emits `coin` and `win`, with a `collect-coin` scenario that uses them.

### Patch Changes

- 1f17bac: Smaller startup: the splash and the Canvas 2D fallback load on demand, so WebGL2 browsers never download the fallback and games without the splash never download it. The starter's startup code drops from 14.1 to 13.3 kB brotli. `debuff build` reports code at startup separately from code loaded on demand.
- b37f2d9: Document turning off the splash for portals: the `splash` option's docs and new projects' AGENTS.md say Poki requires `splash: false`, with a link to the new publishing guide.
- 092b259: The start-up splash shows the new DEBUFF logo on a slanted stripe, punching in and then "boiling" like hand-drawn animation (still for players who prefer reduced motion). The splash no longer opens debuff.jp on click or shows a URL: a click or tap only skips it, so games are safe on portals such as Poki and CrazyGames that forbid links out of the game.
- a162599: The splash uses the DEBUFF wordmark (white letters, thick black outline) without the swoosh.

## 0.4.0

No changes in this release.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

### Minor Changes

- 1f5fb28: `BitmapFont`: pixel fonts from a sprite-sheet grid, with widths measured from the glyph pixels. Pass one as `font` to `draw.text`, `draw.measure` and `@debuffjp/ui` menus. The CLI ships `aseprite/new-font.lua`, which creates a blank font sheet with the grid set up.
- 134c84a: `draw.measure(text, font)` returns the box `draw.text` fills. `@debuffjp/ui` now lays menus out from measured text: a fixed cursor column, right-aligned value rows with left/right changes, `drawPanel` (a titled, centred, evenly padded frame), `panelAround`, and positions snapped to whole pixels. The platformer's pause menu gains a settings screen with a saved volume.

### Patch Changes

- d716ede: Canvas 2D fallback: tinted textures now get their colour, not just their alpha, so text and bitmap fonts render in the requested colour as on WebGL2. Platformer template: a pause button in the HUD for touch players.

## 0.2.0

### Patch Changes

- ab5dcf1: Pixel-art games (`pixelArt: true`) now draw unrotated sprites on whole pixels. Nearest sampling at fractional positions made sprite edges gain and lose a pixel from frame to frame, which read as flicker on bobbing pickups, particles and eased movement.
- 78f0a71: The camera now interpolates between simulation steps (`camera.renderAlpha`, set by `Game` before each render), so camera motion is smooth on displays faster than 60 Hz instead of jumping every few frames. The templates also interpolate their moving sprites using the `alpha` passed to `render`.
- 2eccd11: Splash redesign: buff is drawn from the same pixel art as the CLI, the icon and text form one centred stack, the wordmark uses Outfit when the player has it installed, and `debuff.jp` is shown at the bottom.
- 035dfd9: The splash link now opens `https://debuff.jp/?ref=made-with`. The tag lets the debuff site count visits that come from games built with debuff. It carries no player data.

## 0.1.0

### Minor Changes

- 38d968c: Dev tools can now pause the game and explain slow frames. The overlay gains pause, step, slow-motion and "pause on spike" controls. Its frame graph breaks each frame into update and render time, and you can click a red bar to inspect that frame (steps, quads, draw calls, long tasks) with a plain-words diagnosis. You can flag moments as notes for agents. An activity log, with undo, shows who changed what: you, an agent or a scenario. Dev hooks v2 adds `pause`, `resume`, `speed`, `frames` and `notes`. Core counts `draw.quads` and `draw.drawCalls` per frame.
- 77b3998: `draw.clip(x, y, w, h, fn)` restricts drawing to a rectangle for UI panels, scrolling lists and minimaps. It's a GPU scissor on WebGL2 and a native clip on Canvas 2D, nested clips intersect, and the clip is restored even if `fn` throws.
- f807f89: Errors are now explained, and a crash no longer freezes the game.
  
  - **Core:** an exception in `update` or `render` used to kill the requestAnimationFrame loop while the game still reported itself as running, so `start()` couldn't recover it. Now the loop stops cleanly and records `game.lastError` (phase, scene and tick). It emits the new `hooks.error` and rethrows the error so the console still shows it. `start()` resumes.
  - **Dev tools:** each error is labelled with whose problem it is: your code, a call debuff rejected, a debuff bug (with a prefilled report link) or something outside the game. It shows the source-mapped line, which opens in your editor, plus a plain-words hint. Repeats are counted. `errors()` and MCP `game_errors` return the same structure.
- 2d2a302: Games now open with a short "made with debuff" card in production. It lasts 1.6 seconds, any input skips it, and it respects reduced motion. It's drawn with `draw`, so it needs no assets. It never shows in dev or in stepped runs (scenarios and agents). Pass `splash: false` to remove it, or `splash: { duration }` to change its length.
- 55b9ead: Reduced motion: `game.reducedMotion` follows `prefers-reduced-motion` live (or force it with the `reducedMotion` option), and camera shake drops to a quarter strength when it's on. Read the flag to tone down your own effects.
- 27118f8: Runtime plugin contract (ADR 0004, phase 1).
  
  - New: `game.use(plugin)`, `game.plugins`, `game.hooks` (`beforeUpdate`, `afterUpdate`, `beforeRender`, `afterRender`, `sceneChange`) and `game.inspect.register(name, provider)`.
  - New: `devTools(options)` plugin in `@debuffjp/dev`. `exposeDevHooks` is now shorthand for `game.use(devTools(options))`. `state()` adds `pluginNames` and `plugins`.
  - **Breaking:** `game.afterUpdate(fn)` is replaced by `game.hooks.afterUpdate(fn)`. `Input`'s host now needs `hooks.afterUpdate`; passing a `Game` works unchanged.
- f50defb: Batched WebGL2 renderer behind a new `draw` API (ADR 0007).
  
  - New: `game.draw` with `sprite`, `rect`, `circle`, `line`, `text`, a transform stack, `withCamera`, `blend`, `alpha` and `raw`. It uses WebGL2 instanced, multi-texture batching with an automatic Canvas 2D fallback (`renderer: "auto" | "webgl2" | "2d"`), and sustains about 200k sprites at 60 fps on the renderer benchmark.
  - **Breaking:** `Scene.render(ctx)` becomes `Scene.render(draw)`, and render hooks receive `draw`. `game.ctx` is removed. `camera.apply(ctx)` is replaced by `draw.withCamera(camera, fn)` (`camera.view()` returns the matrix). `Sprite.draw`, `Particles.draw` and `Trail.draw` take `draw`.
  - New: `game.redraw()`, `renderer` in the dev state, and `@debuffjp/cli/client` types.

### Patch Changes

- 9d71ad0: Agents can now work on the game you have open. `debuff dev` relays agent commands to the page over Server-Sent Events, and `game_start` in `@debuffjp/mcp` attaches to that live tab when one is open (otherwise it falls back to a headless copy). The overlay shows an agent badge and logs the agent's actions, which you can undo. New MCP tools: `game_pause`, `game_frames` (per-frame breakdown) and `game_notes` (moments you flagged in the overlay). The WebGL2 draw-call count now includes the pending batch.
- 71b6dd3: The brand lime is now `#cffb2d`, the Debuff Foundation colour. Its tints are rebuilt around it, and the change covers the splash, the dev panel, the CLI colours, the templates and the art.
- a4f2549: Fixed pointer input throwing on every mouse move. `Input` passed `game.toLogical` without its `this`, so the method failed. `toLogical` is now bound, and `Input` calls it through the host. Repeats of a source-mapped error now count as one entry instead of filling the error list. We found both through the MCP server's `game_errors`, and the dev tools labelled the first one as a debuff bug.
- aa0314b: Robustness fixes:
  
  - WebGL context loss: the renderer pauses while the context is lost and rebuilds itself on restore, re-uploading textures from their sources. No more black screen after mobile tab switches or GPU resets. `game.dispose()` now releases GPU resources.
  - Image loading no longer waits on `decode()`, which can stall indefinitely in background tabs and throttled iframes and left games stuck loading.
- 567c0b7: Clicking or tapping the start-up splash opens debuff.jp in a new tab. Keys still just skip it.
