# @debuffjp/input

## 0.18.0

No changes in this release.

## 0.17.0

No changes in this release.

## 0.16.0

### Minor Changes

- 96bebe8: The right and middle mouse buttons are bindable: `"PointerRight"` and `"PointerMiddle"`, so an action like right-click remove goes through `input.down/pressed/released`, scenarios and fuzz like any key. `input.pointer.right` and `input.pointer.middle` hold `down`, `pressed` and `released`, including buttons pressed while another is held; `pointer.pressButton("right")` and `releaseButton` simulate them. The dev hooks' `press("PointerRight")`, scenario `{ "press": "PointerRight" }` and `debuff fuzz --keys PointerRight` press the button, and recorded replays keep it. The primary pointer (`"Pointer"`) is unchanged.
- 5874ea3: `input.pointer.kind` says what made the latest press: `"mouse"`, `"touch"` or `"pen"`, so games don't need their own `pointerdown` listener to read `pointerType`. Contacts in `pointer.touches` carry a `kind` too, and `pointer.touchesStarted` / `pointer.touchesEnded` list the contacts that started and ended this step, so games don't diff the map themselves. `pointer.touchStart(id, x, y, kind?)`, `touchMove` and `touchEnd` simulate contacts through the same path as real ones: the first contact also presses the primary pointer. `pointer.press(x, y, kind?)` takes an optional kind (default `"mouse"`).
- 86eba07: `input.rebind(action, keys)` replaces an action's bindings, for controls menus. It takes a copy of `keys` and updates `input.keys.captured`, so newly bound keys stop scrolling the page and keys no longer bound scroll it again; keys the game added to `captured` itself are left alone. `input.bindings` is now Input's own copy of the map passed in, so rebinding never changes the caller's object. The lists inside it are still the caller's arrays until rebound, so existing code that edits them in place keeps working.
- f9eb177: `input.pointer.wheel` and `input.pointer.wheelX`: the wheel or trackpad scroll over the canvas this step, in CSS pixels (line and page deltas are converted), reset after every step. `pointer.scroll(dy, dx)` simulates it. `new Input(game, { captureWheel: true })` stops the page scrolling while the wheel is over the game, for wheel zoom in embeds; by default the page still scrolls as before.

### Patch Changes

- dda5f57: Keyboard input works after clicking a game embedded in an iframe (game portals such as Wavedash). The pointer's `preventDefault` on `pointerdown` stopped the click focusing the frame, so keys went nowhere until the player clicked outside the game. A press now calls `window.focus()` when the document doesn't have focus.
- fbd1160: A press is no longer dropped when `setPointerCapture` throws. Synthetic pointer events and unknown pointer ids make it throw `NotFoundError`, which stopped the press from registering. The pointer now tries to capture and carries on if it can't.

## 0.15.0

No changes in this release.

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

### Patch Changes

- 08e3a38: Gamepad polling no longer crashes a game embedded in a frame whose permissions policy blocks the Gamepad API (chat app sandboxes, some embeds): `getGamepads()` throwing now counts as no pad.

## 0.11.0

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.5

No changes in this release.

## 0.9.4

No changes in this release.

## 0.9.3

No changes in this release.

## 0.9.2

### Patch Changes

- cc424e9: Gamepad input is now recorded, so rewind, the reload that keeps your place, and replays saved as scenarios reproduce pad sessions. Scenarios gain a `pad` step.
- 9ee5b42: Only the left mouse button presses `Pointer`, keys release when focus leaves the keyboard target, and asset URLs carry a content hash so a redeploy can't mix old and new atlases.

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.0

No changes in this release.

## 0.7.1

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.1

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.0

### Minor Changes

- 88d2571: Embed-friendly input: keys bound to actions no longer scroll the page or trigger browser shortcuts (for example, arrows and Space in an itch.io iframe), except while the player is typing in a form field. Opt out with `captureKeys: false`. The canvas also suppresses the right-click menu.
- 27118f8: Runtime plugin contract (ADR 0004, phase 1).
  
  - New: `game.use(plugin)`, `game.plugins`, `game.hooks` (`beforeUpdate`, `afterUpdate`, `beforeRender`, `afterRender`, `sceneChange`) and `game.inspect.register(name, provider)`.
  - New: `devTools(options)` plugin in `@debuffjp/dev`. `exposeDevHooks` is now shorthand for `game.use(devTools(options))`. `state()` adds `pluginNames` and `plugins`.
  - **Breaking:** `game.afterUpdate(fn)` is replaced by `game.hooks.afterUpdate(fn)`. `Input`'s host now needs `hooks.afterUpdate`; passing a `Game` works unchanged.

### Patch Changes

- a4f2549: Fixed pointer input throwing on every mouse move. `Input` passed `game.toLogical` without its `this`, so the method failed. `toLogical` is now bound, and `Input` calls it through the host. Repeats of a source-mapped error now count as one entry instead of filling the error list. We found both through the MCP server's `game_errors`, and the dev tools labelled the first one as a debuff bug.
