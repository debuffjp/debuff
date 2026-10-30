# ADR 0016: Drawing DOM elements with HTML-in-Canvas

- Status: accepted, experimental in spryte (measured in Chrome 156 with a flag and in Chrome 157 and 159 without one, 2026-10-30)
- Date: 2026-10-29
- Related: ADR 0007 (WebGL2 renderer), ADR 0008 (UI package), ADR 0013 (spryte)

## Context

Canvas games can't use the browser's text layout, form controls or accessibility tree. debuff works around each gap separately: `draw.text` rasterises single lines, word wrap is on the roadmap, text entry (and IME input for Japanese) doesn't exist, and screen readers see an empty canvas.

Chromium's [HTML-in-Canvas API](https://github.com/WICG/html-in-canvas) draws real DOM elements into a canvas. Children of a `<canvas content="drawable">` marked `drawable` are laid out but not shown; `drawElementImage` (2D), `texElementSubImage2D` (WebGL) or `drawElementImageToTexture` (WebGPU) draw them, and `updateElementGeometry` tells the browser where they ended up, so clicks, focus, typing and screen readers follow the drawn position. It shipped in Chrome 157 stable (launch post 2026-10-26; early stable from 2026-10-22, full stable 2026-11-03), after an origin trial from Chrome 148. The API changed shape in Chrome 150 and 155, and 157 keeps only the 155 names (`content="drawable"`, `texElementSubImage2D`, `drawElementImageToTexture`). Mozilla and WebKit have no position yet. PixiJS (`pixi.js/html-source`, since 8.19.0), three.js (`THREE.HTMLTexture`), Babylon.js and PlayCanvas already support it, and Canvas UI ships shader components over live HTML.

## What the prototype found

Measured in Chrome 156 with `--enable-experimental-web-platform-features`, headless through Playwright, on `packages/spryte/examples/html-in-canvas` (a form with a text field and buttons inside a 320x180 view scaled 3x, rotating slightly):

- Both spryte backends draw the element, under the full transform (translate, rotate, scale), with sprites in front of and behind it.
- Text is rasterised at the drawn size, so it stays sharp when the game view is scaled up.
- Clicks and focus land on the element where it is drawn, on both backends. Typing into the field and pressing a drawn button work.
- Drawing from `requestAnimationFrame` works without a `paint` handler. It shows the layout of the previous frame: a DOM change made in frame N appears in frame N+1.
- In WebGL2, re-rasterising a form into a 360x260 texture took a median 1.4 ms of CPU per frame (120 frames, software GPU). Uploading only the elements listed in the canvas's `paint` event (`changedElements`) removes that cost when the element is unchanged.
- `canvasTransform` is in the canvas's CSS pixels, not its backing pixels.
- Without the flag, Chrome 156 doesn't expose the API, and `drawElement` returns false. The prototype uses only the names Chrome 157 keeps.
- Size: `drawElement` is its own module, so a game that doesn't import it pays only for the WebGL2 backend's `lend` hook (`templates/basic`: 26.0 to 26.1 kB brotli).

## Proposal

1. **spryte gains `drawElement(draw, el, x, y, options)` and `canDrawElements()`**, as a separate tree-shakeable module. It moves the element into the canvas on first use and returns false, drawing nothing, wherever the API is missing, inside `into()`, and inside masks.
2. **Nothing in debuff depends on it.** `@debuffjp/ui` could draw a DOM menu when `canDrawElements()` is true and keep its canvas menu otherwise.
3. **Ship it as experimental**, documented as Chromium-only, until another engine implements the API.

## Open questions

- **Determinism.** DOM text uses the machine's fonts (the prototype's Japanese text drew as missing-glyph boxes on a machine without a Japanese font), so scenario screenshots of DOM content would differ between machines. Games would need to ship their fonts, or scenarios would mask DOM regions.
- **Input.** Typing and focus are DOM events outside the input system, which ADR 0008 kept game state away from for replays. A text field's value would need to enter the game through an action or a recorded event.
- **Fallback.** When the API is missing, the element stays where the page put it. A helper could show it as a positioned overlay instead.
- **WebGL2 cost when the element moves.** `updateElementGeometry` runs on every draw; it could be skipped when the transform hasn't changed.
- **Chrome 157.** The prototype hasn't run in 157 yet, where the pre-155 names are gone.
