# spryte

## 0.4.2

### Patch Changes

- dc56b3d: Republish of the shared-mode context-loss fix: 0.4.1 was published from a build made before it, so its `createSharedRenderer` still misses a loss restored between two frames. 0.4.2 carries the fix.

## 0.4.1

### Patch Changes

- 210ec36: Shared mode (`createSharedRenderer`, `spryte/phaser`): recover from a WebGL context loss that is restored before spryte's next frame. spryte polled `isContextLost()` at `begin()`, so a loss and restore between two frames went unnoticed and it kept using objects of the dead context. It now notes both events (without claiming them from the host) and rebuilds at the next `begin()`.

## 0.4.0

### Minor Changes

- 503e0df: spryte inside another engine. `createSharedRenderer(gl)` draws on a WebGL2 context the host owns, inside its frame and draw order: into the host's framebuffer, under its scissor and stencil, leaving its texture filtering alone. `spryte/phaser` wraps it for Phaser 4: `spryteExtern(extern, render)` draws in an `Extern`'s slot with Phaser's camera applied, and `createPhaserContext()` gives Phaser a WebGL2 context with its shaders translated to GLSL ES 3.00 (Phaser 4.2.1's `Gradient`, noise normal maps and `smoothPixelArt` don't compile on WebGL2 otherwise). Also `draw.transform(a, b, c, d, e, f)` multiplies a matrix onto the transform, and `draw.begin(null, ...)` draws over the previous frame instead of clearing.

## 0.3.0

### Minor Changes

- cff2aef: New blend modes: `multiply`, `screen` and `erase`, alongside `normal` and `add`. WebGL2 and Canvas 2D draw them identically over opaque pixels (checked on a real GPU).
- a5e021b: Filters: `filter(draw, filters, fn)` draws `fn` through a chain of ready-made effects: `blur()`, `grayscale()`, `sepia()`, `saturate()`, `hueRotate()`, `brightness()`, `contrast()`, `invert()` and `colorMatrix()`. Each is tree-shakeable. On Canvas 2D the named filters use the browser's CSS filters, which WebGL2 matches to within 2 levels per channel.
- a788f55: `mask(draw, shape, fn)`: keep what `fn` draws only where `shape` draws. The mask can be anything you can draw (sprites with soft alpha, shapes, text), it nests, and it works inside render targets. A rectangle mask is pixel-identical to `clip()` on both backends.
- d7ec5ea: `nineSlice(draw, …)` for UI panels that stretch without stretching their corners, and `tiled(draw, …)` for repeating fills (scrolling backgrounds, floors) that work on frames inside an atlas. Both are plain quads, so they batch with sprites, run through custom shaders and match on both backends.
- 6dff019: Shapes, masks, filters, `nineSlice` and `tiled` are standalone functions that take the `Draw` (`roundRect(draw, …)`, `mask(draw, shape, fn)`), so apps only ship what they use. spryte's startup JS is 11.3 kB brotli without them (a minimal app, `bench/size`).
- 1979a2e: Vector shapes: `polygon` (concave is fine), `polyline` (strokes with mitred joins), `roundRect` (filled or outlined) and `ring`. On WebGL2 they're tessellated on the CPU and antialiased with a one-pixel feathered edge, so they match Canvas 2D's antialiasing without MSAA, and they batch in draw order with sprites. Custom shaders (`withShader`) don't apply to shapes.

### Patch Changes

- b563010: `blur()` takes half the texture samples (two texels per tap through linear filtering) and reaches twice as far: blurs up to about 40 device pixels now match CSS `blur()`, instead of being cut short past 20.
- 885d45d: Canvas 2D fallback: browsers whose Canvas 2D ignores `ctx.filter` (Safari before 18) now warn once and draw unfiltered, detected with a one-pixel probe. GPU checks run in Firefox and WebKit too (`SPRYTE_BROWSER=firefox|webkit`).
- 5e31eeb: Shapes batch faster: indexed geometry and a fan for convex shapes (5,000 round rects: 39 ms to 17 ms on an AMD 780M laptop), and sprites drawn between shapes join the shape batch, so UI that alternates panels and icons is one draw call instead of one per switch (5,000 pairs: 50 ms to 18 ms).

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
