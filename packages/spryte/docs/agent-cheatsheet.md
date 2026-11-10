# spryte for agents

The whole drawing API on one page, for an agent that has to write a scene without reading [the full reference](api.md). Everything comes from `import { ... } from "spryte"`. Units are logical: you pick them in `begin()`.

## A frame

```ts
const draw = createRenderer(canvas, { smooth: true });   // smooth:false for pixel art; backend "auto" falls back to Canvas 2D
draw.resize(canvas.width, canvas.height);                // after any change to the backing size
// each frame
draw.begin("#101820", 320, 180, canvas.width / 320);     // clear colour (null = draw over), logical w, h, pixels per unit
draw.rect(10, 10, 40, 20, "#f55");
draw.end();
```

Size the canvas yourself: set `canvas.width = cssWidth * devicePixelRatio` (same for height), call `draw.resize`, and pass `scale = canvas.width / logicalWidth` to `begin()`. The logical size is yours to choose, so to fill a window of any shape, derive it from the canvas (`logicalWidth = canvas.width / scale`) instead of fixing it. Nothing letterboxes for you.

Colours: `"#rgb"`, `"#rrggbbaa"`, `0xRRGGBBAA` or any CSS colour. Draw in paint order.

## Draw calls

| Call | Does |
| --- | --- |
| `rect(x, y, w, h, c)`, `circle(x, y, r, c)`, `line(x1, y1, x2, y2, width, c)` | Shapes. |
| `sprite(imgOrFrame, x, y, o?)` | `o`: `origin`, `scaleX`, `scaleY`, `rotation`, `flipX`, `flipY`, `alpha`, `tint`, `flash`, `smooth`. Reuse the `o` object in loops. Many call sites with different options: build each with `spriteOptions(o)` (0.13+) so they share one shape. |
| `sprites(frame, xy, n?, o?, each?)` | One frame at many positions. `xy` is a `Float32Array` of x, y pairs, uploaded as is. |
| `text(s, x, y, {font, color, align, baseline, alpha})`, `measure(s, font?)` | CSS or `BitmapFont` text. |
| `polygon`, `polyline`, `roundRect`, `ring`, `mesh`, `nineSlice`, `tiled` | Import them and pass `draw` first: `roundRect(draw, x, y, w, h, r, c)`. |

An image is an `HTMLImageElement`, `HTMLCanvasElement`, `OffscreenCanvas`, `ImageBitmap` or render target. A `Frame` is `{ image, x, y, w, h }`, a rectangle of an image; pass the image itself to use all of it. Sprites are centred on `x, y`: `origin: [0, 0]` anchors the top left. `text` takes `align` `"left" | "center" | "right"` and `baseline` `"top" | "middle" | "bottom"`. In `sprites`, `n` counts sprites (not floats) and `n`, `o` and `each` can be left out.

## A million sprites

Interleave the data and let a worker write it into shared memory. Nothing runs in JavaScript per sprite:

```ts
const data = new Float32Array(new SharedArrayBuffer(MAX * 16)); // x, y, scale, colour per sprite
const bits = new Uint32Array(data.buffer);                      // write colours through this view
draw.sprites(dot, data, n, {}, { stride: 4, scale: 2, color: 3 }); // each.* are offsets into a record
```

Without `stride`, `each` takes arrays instead: `scale`, `rotation` (`Float32Array`), `color` (`Uint32Array` of `0xRRGGBBAA`: red is the top byte, so pack it as `(r << 24 | g << 16 | b << 8 | a) >>> 0`), `frame` (index into a `Frame[]`). Use one image per call: frames across images draw one quad each. The page needs cross-origin isolation headers to use `SharedArrayBuffer`.

## State

`push()` `pop()` `translate(x, y)` `scale(x, y?)` `rotate(rad)` `transform(a, b, c, d, e, f)` form a stack. `begin()` resets that stack, the blend mode and any shader each frame. Also: `clip(x, y, w, h, fn)`, `withCamera(cam, fn)` for any `{ view() }`, `blend("normal" | "add" | "multiply" | "screen" | "erase")`, and the properties `alpha`, `smooth` and `font`.

## Effects

```ts
const wave = draw.createShader(`
  uniform float time;
  vec4 effect(vec4 color, vec2 uv) {   // premultiplied in and out
    uv.x += sin(uv.y * 40.0 + time * 6.0) * 0.01;
    return source(uv) * color;         // source(uv) samples the drawn image; frameUv() is 0..1 inside the frame
  }`);
wave.set("time", t);                   // float or [x, y], [x, y, z], [x, y, z, w]
draw.withShader(wave, () => draw.sprites(dot, data, n));
```

`uv` is in atlas space, so use `frameUv()` for anything shaped by position inside the drawn sprite. It is per sprite: it can't tint by where a sprite sits on screen. For that, pass a position-based colour per sprite in `each.color`, or a uniform. `set()` affects only draws made after it, even inside the `withShader` callback. Shaders need WebGL2: on Canvas 2D the draws happen without the effect. `filter(draw, [blur(4), sepia()], fn)` runs `fn` through CSS-style filters. `mask(draw, shape, fn)` keeps what `fn` draws where `shape` draws.

## Offscreen and static

```ts
const t = draw.createTarget(160, 90);                 // pixels
draw.into(t, () => draw.sprites(spark, p, n));        // draw into it, then draw it like an image
draw.sprite(t, 0, 0, { origin: [0, 0], scaleX: 2, scaleY: 2 });
draw.disposeTarget(t);

const ground = draw.record((d) => tiles.forEach((k) => d.sprite(frames[k.id], k.x, k.y))); // sprites that never change
draw.replay(ground);                                  // each frame; ground.dispose() when done
```

`begin()` and `end()` belong to the screen pass only. Calling them inside `into()` gave an all-black target in testing, with no error. Inside `into()` the target starts transparent. On a target, `uv.y` runs bottom to top in a shader.

## Real HTML in the scene

```ts
if (!drawElement(draw, menu, 40, 30, { w: 200, h: 80 })) showHtmlMenu(); // false means no support: the element stays in the page
```

Chrome and Edge 157+. The element keeps its text, links and focus. Call it every frame: the first call moves the element into the canvas and draws nothing, and later calls show its layout from the previous frame. `x, y` and `w, h` are logical units, and the default size is the element's CSS size. It also returns false inside `into()` or a mask. `canDrawElements()` tells you before you start. Keep the CSS that places the element for the fallback, because without support it stays in the page where its CSS puts it.

## Render it and look at it

To check a scene without a human, expose one function and run [komadori](https://github.com/debuffjp/komadori), the render tool:

```ts
window.__frame = () => { step(1 / 60); drawFrame(); }; // advance exactly one frame, draw, return
```

```sh
npx komadori dist --frames 300 --size 1920x1080 --out render-out [--mp4 clip.mp4]
```

`dist` is a built page (or a URL). In TypeScript, declare it: `declare global { interface Window { __frame?: () => void } }`. It writes `render-out/contact-sheet.png` and `report.json`, and exits 1 on a page error, a shader that fails to compile (it names the line of your shader), a blank scene or a frozen scene. A scene that sits still for its first second fails the frozen check, so start it already moving. Open the contact sheet and look at it: the checks can't see stripes, text covered by sprites or an ugly palette. `--keep-frames dir` saves each sampled frame full size, which is what you need to judge detail. `--samples 10` makes a shorter run, `--mp4` needs ffmpeg, and on a machine without a GPU set `SOFTWARE_GL=1`. `npx komadori --help` lists the rest.

## Rules that save a debugging round

- Call `draw.dispose()` when done. spryte never owns your images: use `invalidate(img)` after changing pixels.
- A lost WebGL context draws nothing until it restores. `draw.contextLost` says so.
- Check `draw.drawCalls` and `draw.quads`. One call per frame for a million sprites is the goal.
- To tell GPU-bound from CPU-bound, use `gpuTimer(draw)` (`gpu.begin()` before `draw.begin()`, `gpu.end()` after `draw.end()`, then read `gpu.ms`).
