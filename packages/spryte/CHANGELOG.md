# spryte

## 0.2.3

### Patch Changes

- 30ff49d: `draw.circle` stays crisp at large sizes. It used to stretch one 64px texture to every radius, so big circles (and the rounded corners built from them) blurred, especially on high-DPI screens. It now picks a 64, 256 or 1024px texture by the circle's size on screen.

## 0.2.2

### Patch Changes

- 2e71515: README: particle frame-time chart and the raycaster result from 2dbench. Benchmarks doc: results across devices.
- 33d6a29: Text that changes often is much faster on WebGL2. `draw.text` with a CSS font now packs strings into shared atlas pages and uploads only each new string's rectangle, instead of creating a texture per string, so labels batch into one draw call. In 2dbench's text scene (1,000 labels, each changing every 8 frames) a frame drops from 10.4 ms to 2.7 ms on an RTX 5060 laptop; at 5,000 labels spryte (5.3 ms) is now ahead of Canvas 2D (9.8 ms) and PixiJS BitmapText (22.9 ms). Pixels are unchanged, and the Canvas 2D fallback keeps its per-string cache.

## 0.2.1

### Patch Changes

- 984a0eb: README: logo, what spryte is for beyond games, links to the guides and the PixiJS migration guide, and where to get help.

## 0.2.0

### Minor Changes

- 1ca1155: `createRenderer(canvas, { transparent: true })` makes a see-through canvas: clear with an alpha colour (`"#0000"`) to draw over the page or another renderer, such as particles over a PixiJS scene.

### Patch Changes

- 68dec64: Canvas 2D fallback: tint and flash on partly transparent pixels now match WebGL2 (they bled the raw tint colour in before). Tinted or flashed frames are recoloured once per source, frame, colour and flash and cached.
- 3d1f9e2: No more flicker on dual-GPU Windows laptops: spryte no longer asks for a desynchronized (low-latency) canvas, which Chrome presents unreliably there.
- 6bc9e5d: `draw.text`: the text cache no longer thrashes when a frame shows more than 256 distinct strings. It used to evict and re-rasterise strings still on screen every frame (155 ms a frame for 540 labels in 2dbench, 709 ms for 2,000). Now it never evicts a string drawn this frame or the last and grows to fit: 5.4 ms and 12.3 ms. Recovery after a lost WebGL context drops from 737 ms to 93 ms.

## 0.1.2

### Patch Changes

- 3a328dd: npm description and README lead with the measured result and link 2dbench.

## 0.1.1

### Patch Changes

- 247d5a4: Fixes from an adversarial QA pass: a shader that fails to compile no longer breaks the renderer; `draw.sprites` clamps `count` to the arrays it's given (it used to draw nothing on WebGL2 when `count` was too large); Canvas 2D keeps smoothing correct after a clip; oversized or fractional render targets throw clearly; using a disposed `Draw` throws. README and benchmark docs now use the interleaved, parity-gated results: 2–3.8× faster than PixiJS 8 like for like (0.1.0's README overstated several cases).
