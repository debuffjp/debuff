# spryte

## 0.16.0

### Minor Changes

- 8784a2c: `source(uv)` in custom shaders now takes a `highp` uv, as do spryte's built-in effect and blur. Shaders run under `precision mediump float`, so before this a texture read through `source()` was addressed at fp16 on many mobile GPUs and sampled the wrong texels in images past about 1024 px, whatever precision the effect declared. The documented signature is now `vec4 effect(vec4 color, highp vec2 uv)`; an unqualified `vec2 uv` still compiles but stays mediump. Reported in #110.
- 8784a2c: `Shader.set()` with the value a uniform already has no longer ends the batch. Numbers and arrays compare by value; a texture, or the same array object passed again (its contents may have changed), still flushes. The Shader docs now say that a shader switch and a uniform change each end a batch, and show the pattern for per-sprite values: one `withShader` around the whole walk. Reported in #109.
- 8784a2c: `source()` in custom shaders picks the batch's texture with a `switch` instead of a chain of eight `if`s. A 16-tap effect over eight textures took about 35% less frame time on an RTX 5060 (7.1 ms to 4.6 ms median for 32 full-HD layers), with the same pixels. One-tap effects, including spryte's default program, showed no measurable change. Reported in #111.
- 8784a2c: `draw.sprite` takes `user` and `user2` options: two floats a custom shader reads as `user()` and `user2()`, as `draw.sprites` copies already could through `each`. The sprite stays in the batch, so a per-sprite parameter (a share, a variant, a flag) no longer has to be packed into the tint. Sprites that set neither read 0. The values travel in a separate buffer that is uploaded only for a batch that uses them, so draws without a custom shader don't change. `spriteOptions()` includes the two new fields. Reported in #113.
- 8784a2c: `asData(image, { premultiply: false })` uploads an image with straight alpha, under either blend space, so data packed into RGBA (timings, indices) survives where alpha is below 255. Other images still upload premultiplied. It works for an `<img>`; a canvas already holds premultiplied pixels, and an `ImageBitmap` keeps the `premultiplyAlpha` it was made with. Reported in #112.

### Patch Changes

- bed271b: A render target refilled with `draw.into()` after it was drawn stays filled. Its texture could still be bound to a texture unit from the earlier draw (or from its own creation), so the next draw into it was a feedback loop: WebGL rejected it and logged `GL_INVALID_OPERATION ... Feedback loop formed between Framebuffer and active Texture`, and the target stayed blank. Switching to a target now rebinds the 8 sprite units first. The same loop hit frames of shapes only under `blendSpace: "linear"`, whose sRGB framebuffer texture stayed bound after `end()` presented it; it no longer does. Reported in #118.

## 0.15.0

### Minor Changes

- 01bb09c: Add `lines(draw, segments, count?, options?, each?)`: many lines in one call, for graph edges, grids and vector fields. `segments` is x1, y1, x2, y2 per line. On WebGL2 it's one instanced draw call and a `Float32Array` is uploaded as is; options set a shared `width`, `color` and `alpha`, and `each` adds a per-line `width` or `color`. Each line lands on the pixels `line()` draws with the same values. On the Canvas 2D fallback each line is drawn with `draw.line()`. Import it from `spryte` like `polyline`: apps that don't use it don't bundle it.

## 0.14.0

### Minor Changes

- 9692a38: `draw.sprites` takes `each.user`, one float per copy (an array, or an offset into the record with `stride`). A custom shader reads it as `user()`: a copy's place in a row for a staggered effect, a particle's age, a tile variant. `user()` is 0 for anything that isn't a `draw.sprites` copy. The default program ignores the value, and so does the Canvas 2D fallback. Its cost on the instanced path hasn't been measured yet.
- 634e501: Render targets can hold values above 1. `draw.createTarget(w, h, { format: "rgba16f" })` stores half floats where WebGL2 has `EXT_color_buffer_float` or `EXT_color_buffer_half_float`, and falls back to `rgba8` elsewhere; `target.format` says which you got and `draw.supportsTarget(format)` asks without making one.
- 73050a1: `createRenderer(canvas, { blendSpace: "linear" })` blends in linear light on WebGL2. With the default sRGB blending, anti-aliased edges come out dark, so dark text on light paper looks heavier and light text on dark paper thinner; in linear light the weight stays the same when the colours swap, and soft edges and glows add up like light. Drawing goes to an sRGB framebuffer that `end()` copies to the canvas, one extra full-screen pass. Colour images and render targets are stored as sRGB. New `asData(image)` keeps a data image (an MSDF atlas, a lookup table) raw; call it before the image is first drawn. `draw.createTarget(w, h, { data: true })` does the same for a render target that holds data, such as a simulation field. Every shader now has `spryte_toLinear(rgb)`, which converts an sRGB colour under linear blending and returns it unchanged otherwise, and `SPRYTE_LINEAR` is defined in linear mode. The default is unchanged, and Canvas 2D and shared renderers always blend sRGB.
- 25cf5fc: `Shader.set()` takes uniform arrays and textures as well as floats and vectors.
  
  ```ts
  const fx = draw.createShader(`
    uniform vec4 pool[64];
    uniform sampler2D noise;
    vec4 effect(vec4 color, vec2 uv) { return source(uv) * color * pool[0] * texture(noise, frameUv()).r; }
  `);
  fx.set("pool", poolValues);                     // Float32Array or number[], packed flat
  fx.set("noise", noiseCanvas, { smooth: true }); // image, canvas, ImageBitmap or render target
  ```
  
  - Arrays set `float`, `vec2`, `vec3` and `vec4` arrays. spryte reads the type from the compiled shader, so 4 numbers on a `float[4]` set the array and on a `vec4` set the vector. A length that isn't a whole number of elements, or is longer than the declared array, throws an error naming the uniform.
  - A texture on a `sampler2D` goes on its own texture unit from 8 up, apart from the 8 units sprite batches use, and stays bound for every batch drawn with the shader. Filtering is nearest unless `smooth` is set. A render target reads from its bottom row (`uv.y` runs bottom to top), and a shader can't sample the target it draws into.
  - Bad values throw at `set()` while the shader is in use, or when `withShader`, or `into()` with the shader active, would start using them, before anything changes.
  - `set()` on a uniform the compiler removed does nothing, as it did for floats and vectors.
  
  Floats and tuples on plain uniforms behave as before. The Canvas 2D fallback still draws without the effect.

### Patch Changes

- 4b1074d: `isData` also accepts images tagged with `Symbol.for("spryte.data")`, so a library such as shodo can mark its MSDF atlases as data under `blendSpace: "linear"` without importing spryte. The tag also works when a bundle holds two copies of spryte.

## 0.13.0

### Minor Changes

- 159795e: `spriteOptions(o)` builds `draw.sprite` options with every field present (`undefined` for a default), so all of a game's options objects share one shape. V8 caches `draw.sprite`'s property reads for up to four shapes, and a game passing `{ rotation }` in one place, `{ tint }` in another and `{}` elsewhere goes past that. With eight shapes, 200k `draw.sprite` calls took 13.9-14.7 ms in Node 22; the same eight built with `spriteOptions` took 7.1-8.4 ms. Build each object once and change its fields in place. A game that only ever passes one or two shapes doesn't need it. `@debuffjp/core` re-exports it. The fields of `SpriteDrawOptions` now accept `undefined` explicitly, which means the default as before.

### Patch Changes

- 84a9191: Unrotated pixel-art sprites cost less CPU. Snapping each one to whole pixels used `Math.round`, which V8 runs slowly. spryte now uses `Math.floor(v + 0.5)`, which rounds the same way. In 2dbench's bunny scene (200k unrotated `draw.sprite` calls, RTX 5060 Laptop, Chrome), the median frame went from 18.6 ms to 14.6 ms over 5 interleaved rounds, and pixel parity held. Rotated and smooth sprites never took that path, so they're unchanged.
- ec09e10: `draw.sprite` is small enough again for V8 to inline into a game's loop. Its layer-recording and Canvas 2D paths now live in a separate method. When V8 can't inline a call, it boxes the call's number arguments on the heap, which meant garbage for every sprite. In 2dbench's bunny scene (200k sprites, RTX 5060 Laptop, Chrome), the median frame went from 15.3 ms to 14.7 ms over 5 interleaved rounds. The mixed scene didn't change.

## 0.12.5

### Patch Changes

- 719cea8: The shader docs (JSDoc on `Shader` and `withShader`, `docs/api.md`) now say what custom shaders do with shapes. `rect()`, `line()` and `circle()` run the effect, with `frameUv()` from (0, 0) to (1, 1) across each, so a full-screen vignette can be a `rect()` over the view with no render target. The vector shapes (`polygon`, `polyline`, `roundRect`, `ring`) and `mesh` draw without the effect. Up to 0.12.3 the docs said shapes get (0, 0), which was wrong for both. They also note that `uv.y` runs bottom to top on a render target, where `frameUv()` runs top to bottom. Behaviour is unchanged.

## 0.12.4

### Patch Changes

- ce39b44: On WebGL2, a frame that threw before `end()` no longer leaks its unfinished batch into the next frame. Before, the next `begin()` cleared the screen and then drew the stale sprites and shapes on top.
- b87e7f9: On WebGL2, an image drawn before it finished loading no longer keeps drawing as a white box once it loads. The renderer's one-entry texture cache remembered the white placeholder for the image, so its pixels were never uploaded until a rect, circle or text draw happened to reset the cache. Canvas 2D was not affected.
- 91e3c60: A renderer disposed before its Canvas 2D fallback finished loading stays disposed. Before, the fallback replaced the disposed stand-in when it arrived, so the renderer drew again despite "using this Draw afterwards throws".

## 0.12.3

### Patch Changes

- ce6fe88: Warn once in development when `draw.sprites` gets `each.frame` frames from more than one image. Those copies draw one quad each instead of one instanced call, and before 0.12.3 nothing said so. Put the frames on one atlas to keep it one call.

## 0.12.2

### Patch Changes

- d43cd3d: Snap bitmap glyphs to whole logical pixels after scale and translation, matching pixel-art sprites on WebGL2 and Canvas 2D. Before 0.12.2, only local positions were rounded, so centred or right-aligned text could land between pixels under a fractional parent translation. Rotated and skewed text keeps its transformed positions.

## 0.12.1

### Patch Changes

- c9a0a2e: `draw.sprites` warns once per renderer when an array it gets is detached, which happens to a view of wasm memory after that memory grows. Before, it drew nothing with no message. The docs now say to recreate such views after growth or each frame.

## 0.12.0

### Minor Changes

- 3faf45c: New `mesh(draw, frame, vertices, uvs, indices?, options?)`: draw an image stretched over triangles you place, for trails, ropes, waving flags and bent sprites. UVs are in source pixels from the frame's top-left, so atlas frames work. On WebGL2 meshes join the shape batch (one draw call with the shapes and sprites around them), and a two-triangle mesh over a frame matches `draw.sprite` pixel for pixel. Canvas 2D clips and draws each triangle, which is slower and can show faint lines along shared edges. It's a separate import: 1.6 kB brotli for apps that use it (0.1 kB if they already draw shapes), 0.08 kB for apps that don't.
- 55660ca: New `mipmaps` option for `createRenderer`: build mip levels for every uploaded image, so smooth images drawn well below their size (zoomed-out maps, charts, thumbnails) stay steady instead of shimmering. Off by default; costs a third more GPU memory per image. Render targets, borrowed host textures and `smooth: false` draws are unaffected.

## 0.11.0

### Minor Changes

- b17a196: Static layers: `draw.record(fn)` keeps the sprites `fn` draws in a `Layer` without drawing them, and `draw.replay(layer)` draws them all again under the current transform. On WebGL2 a replay is one draw call per eight images, with the instances in a GPU buffer made once, so a tilemap or background costs no JavaScript per sprite. It puts the same pixels on screen as drawing the sprites one by one, pixel snapping included at fractional camera offsets and zoom (checked on a real GPU against direct drawing on both backends). `draw.alpha` applies at replay. On Canvas 2D, under a custom shader or `draw.alpha` below 1, replay draws the sprites one by one. After a context loss the layer's buffers are rebuilt; `layer.dispose()` frees them.

## 0.10.0

### Minor Changes

- e44fbbc: Custom shaders get `frameUv()`: the position inside the drawn frame, from (0, 0) at the top left to (1, 1) at the bottom right. `uv` stays in atlas space, so effects shaped to a sprite no longer need the frame's atlas rect passed as a uniform. `@debuffjp/core` now re-exports the `Shader` and `UniformValue` types.

## 0.9.0

### Minor Changes

- 0403e36: `drawElement` (experimental): draw a live DOM element (a menu, a text field, rich text) inside the canvas, through spryte's transforms and shaders, with Chrome's HTML-in-Canvas API (Chrome and Edge 157 and later). The element keeps clicks, focus, typing, text selection and screen readers where it's drawn. It returns false, drawing nothing, where the API is missing, so the element stays in the page. `canDrawElements()` reports support. Guide: https://debuff.jp/spryte/html-in-canvas

## 0.8.0

### Minor Changes

- cc3125d: New `gpuTimer(draw)`: GPU milliseconds for what you draw between its `begin()` and `end()`, to tell a GPU-bound frame from a CPU-bound one. Results arrive a few frames late and never block. `ms` stays `undefined` where timing isn't available (Canvas 2D, and browsers without `EXT_disjoint_timer_query_webgl2`, which in practice means everything but Chromium on desktop), after a GPU timing glitch, and when a host engine or profiler is already timing the frame. Separately imported, so it adds nothing unless used.
- c3669d4: `draw.sprites()` takes interleaved data. Set `each.stride` and `positions` becomes one record of `stride` floats per copy, uploaded to the GPU as is; `each.scale`, `rotation`, `color` and `frame` then take offsets into the record. `positions` must be a `Float32Array` and may view a `SharedArrayBuffer`, so a worker's buffer draws without a per-frame copy.
  
  `sprites()` inside `withShader` now stays one instanced draw instead of one quad per copy: the effect is compiled against the per-copy program. Only `source(uv)`, `color` and `uv` are guaranteed inside `effect` there. Frames across images still draw one quad per copy.

### Patch Changes

- 56749bb: Canvas 2D fallback: tinted sprites in more than 256 colours no longer slow to seconds per frame. The cache of recoloured copies used to clear completely at 256 entries, so animated or per-copy colours re-tinted nearly every sprite every frame; it now drops the least recently used entry and holds up to 1,024 per image. Repeating the last tint also skips the cache lookup. Output is unchanged. Measured in headless Chrome: 6,000 copies in 1,000 colours went from 2.2 s to 36 ms per frame, and 60,000 copies in one colour from 212 to about 180 ms.

## 0.7.3

### Patch Changes

- d929832: `draw.sprite()` is faster again on WebGL2: a sprite drawn under the same transform as the one before it now skips straight to writing its instance, instead of re-checking the transform, the texture and the batch. On 2dbench (RTX 5060 laptop, Chrome 155), the mixed scene at 50,000 sprites went from 5.8-6.0 ms to 4.1-5.0 ms and bunny from 5.2-6.0 ms to 4.1-4.7 ms, over two interleaved passes, with the same pixels. Scenes that don't use `draw.sprite` per sprite don't change. Startup JS grows by about 0.1 kB (brotli).

## 0.7.2

### Patch Changes

- 809a84c: `draw.sprite()` is faster on WebGL2: the vertex shader now does each sprite's rotation, scale and anchor maths, which spryte used to do in JavaScript. In 2dbench's mixed scene (rotation, scale, tint and alpha on every sprite), a 50,000-sprite frame went from 7.1 ms to 5.5 ms on an RTX 5060 laptop, with the same pixels. Unrotated pixel art is still rounded to whole pixels on the CPU, so it lands where it did. Sprites and other drawing (rects, text, shapes) still share one batch. The Canvas 2D fallback is unchanged. Startup code is about 0.7 kB larger (brotli).

## 0.7.1

### Patch Changes

- 36b1bee: Docs keep what changed: the ui README and JSDoc describe the squish default, `debuffFrame` and the lime bars as they were before 0.19, and spryte's docs say what 0.6 did before borrowed textures were looked up every frame.

## 0.7.0

### Minor Changes

- a5d8af2: `spryte/pixi`: draw with spryte inside a PixiJS v8 app through a `RenderContainer`, in Pixi's scene order, under its masks, filters and render textures, on Pixi's own WebGL2 context. Images Pixi has uploaded draw from Pixi's GPU textures and stay marked as used for Pixi's texture GC. Borrowed textures are now looked up again every frame, so a host that frees or re-creates one is never drawn stale.

## 0.6.0

### Minor Changes

- 209fc38: `spryteExtern` draws images Phaser already loaded from Phaser's own GPU textures, so a texture shared by both is no longer uploaded twice. `createSharedRenderer` takes a `borrow` option that lets any host engine lend its textures the same way.

## 0.5.1

### Patch Changes

- 70a00c9: npm homepage links to the package's page on debuff.jp.

## 0.5.0

### Minor Changes

- 7838cf8: `draw.sprites` takes a frame per copy: pass a `Frame[]` as the first argument and index it with `each.frame`. A belt of different items or a swarm at different animation phases is one draw call instead of one call per frame. Frames on one image draw instanced; frames across images fall back to one quad per copy. The Canvas 2D fallback and `withShader` take the same path as before.

## 0.4.3

### Patch Changes

- 927bbd0: Ten fixes from a review of the whole package:
  
  - `roundRect` lost its last corner at radii of about 18 device pixels or more: the point buffer was half the size it needed.
  - The text cache for strings that get their own canvas (the Canvas 2D fallback, and tall strings on WebGL2) grew without bound while text kept changing. It now holds at least 256 strings, plus whatever is on screen.
  - An image drawn before it finished loading stayed invisible: its 0×0 size and empty texture were cached for good. Both are now read again once it has loaded.
  - `draw.invalidate(src)` also forgets the source's size, so a resized canvas draws at its new size.
  - `mask()` and `filter()` inside `draw.clip()` on Canvas 2D leaked the clip's `save()` every frame, and on WebGL2 a filter's first pass was cleared only inside the clip, so its blur sampled stale pixels at the edges.
  - `into()`, `mask()` and `filter()` nested inside a mask or filter at a render scale other than 1 drew at the wrong scale: the outer size was taken in pixels instead of logical units.
  - `into()` with a translucent clear colour on WebGL2 cleared with straight alpha instead of premultiplied, so the colour came out too bright and differed from Canvas 2D.
  - A target the GPU refuses (too large, or an incomplete framebuffer) no longer leaves `into()`'s transform, clips, alpha and render scale changed.
  - Shared mode: a render target first drawn as an image (never drawn into) rebound the canvas instead of the host's framebuffer for the rest of the frame.

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
