# keiko

## 0.3.0

### Minor Changes

- 3da761c: Runs real open-source Phaser 3 and PixiJS games: browser module resolution and dependency pre-bundling, inline Web Workers, `blob:` URLs, XHR loads, audio buffers, GLSL reflection and CSS-sized canvases. Adds `run()` and `eventually()` for games whose UI flows are async, and a `viewport` option.

## 0.2.0

### Minor Changes

- 28f9d49: keiko now runs games from every major web engine, verified against Phaser 4, PixiJS 8, KAPLAY, Excalibur and three.js:
  
  - **Timers on the virtual clock:** `setTimeout`, `setInterval` and `requestIdleCallback` wait on game time, so timer-driven gameplay steps deterministically. Nested zero-delay timers clamp like a browser's. Use the new `sleep(ms)` export to wait in real time inside a test.
  - **WebGL:** an inert WebGL 1/2 context, so WebGL-only engines boot (`play({ webgl: false })` to fall back to Canvas 2D).
  - **Pointer input:** the canvas reports a real size and events carry `pageX`/`offsetX`/`x`, so clicks land where they were aimed. Keys go to the focused element or the game canvas.
  - **Loading:** `play()` waits for the game's first requests to finish; `await game.settle()` waits for lazy loads. Games on the virtual clock get their first frame before the test starts. Images are real `<img>` elements; fonts and audio decoding work.
  - **`beforeEach` / `afterEach`**, folders as CLI arguments (`keiko tests/levels`), and errors raised between tests are reported instead of crashing the run.

## 0.1.1

### Patch Changes

- d359aa1: `npx keiko` exits cleanly on Windows (no libuv assertion after the run), and the package links to its own README as its homepage.

## 0.1.0

First release: fast, deterministic logic tests for web games. The real game runs in Node with no browser, on a virtual clock (`requestAnimationFrame`, `performance.now`, `Date.now`, seeded `Math.random`), driven through debuff's dev hooks, an optional `window.__KEIKO__`, or DOM events. `play`, `until`, `during`, `trace`, `test.sweep`, `test.deterministic`, `replay` and `expect`, with the `keiko` CLI.
