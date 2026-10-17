---
"keiko": minor
---

keiko now runs games from every major web engine, verified against Phaser 4, PixiJS 8, KAPLAY, Excalibur and three.js:

- **Timers on the virtual clock:** `setTimeout`, `setInterval` and `requestIdleCallback` wait on game time, so timer-driven gameplay steps deterministically. Nested zero-delay timers clamp like a browser's. Use the new `sleep(ms)` export to wait in real time inside a test.
- **WebGL:** an inert WebGL 1/2 context, so WebGL-only engines boot (`play({ webgl: false })` to fall back to Canvas 2D).
- **Pointer input:** the canvas reports a real size and events carry `pageX`/`offsetX`/`x`, so clicks land where they were aimed. Keys go to the focused element or the game canvas.
- **Loading:** `play()` waits for the game's first requests to finish; `await game.settle()` waits for lazy loads. Games on the virtual clock get their first frame before the test starts. Images are real `<img>` elements; fonts and audio decoding work.
- **`beforeEach` / `afterEach`**, folders as CLI arguments (`keiko tests/levels`), and errors raised between tests are reported instead of crashing the run.
