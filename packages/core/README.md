# @debuffjp/core

Game loop, fixed-step clock, scenes, camera, sprites and typed creative parameters. Rendering is [spryte](../spryte), a batched WebGL2 renderer with automatic Canvas 2D fallback, re-exported here so `Draw`, `BitmapFont` and friends import from `@debuffjp/core` as before. One dependency (spryte), no others.

```bash
npm install @debuffjp/core
```

```ts
import { Game } from "@debuffjp/core";

const game = new Game({ canvas, width: 320, height: 180, scale: "integer", pixelArt: true });

const tuning = game.params.define("player", {
  speed: { type: "number", default: 140, min: 0, max: 600, units: "px/s" },
});

game
  .add({
    id: "play",
    update(dt) {
      /* simulation at a fixed step */
    },
    render(draw, alpha) {
      /* draw in logical units */
    },
    inspect: () => ({
      /* JSON snapshot for tools and tests */
    }),
  })
  .go("play");
game.start();
```

## API

| Export | Purpose |
| --- | --- |
| `Game` | Loop, scenes, scaling, `camera`, `random`, `params`, `stats`, `freeze()`, `timeScale`, `step(n)`, `emit(name, detail?)` (mark a game event, such as a coin or a death, for tests and agents) |
| `game.use(plugin)`, `Plugin` | Install runtime plugins. See [docs/plugins.md](https://github.com/debuffjp/debuff/blob/main/docs/plugins.md) |
| `game.hooks` | `beforeUpdate`, `afterUpdate`, `beforeRender`, `afterRender`, `sceneChange`. Each returns an unsubscribe function |
| `game.inspect` | `register(name, () => json)` for dev tools and scenarios |
| `Scene` | `{ id, enter?, update?, render?, exit?, inspect? }` |
| `Camera` | Smoothed follow, deadzone, bounds, trauma shake, culling, `toWorld()` |
| `Sprite`, `sliceGrid` | Frames, named animations, origin, flip, impact flash |
| `draw.text`, `draw.measure` | Text in debuff sans (the built-in pixel font), a `BitmapFont` or a CSS font; `measure` returns the box `text` fills |
| `debuffSans()` | The built-in pixel font: printable ASCII, 5x7 capitals with descenders, proportional, white so `color` tints it |
| `BitmapFont` | Pixel font from a sprite-sheet grid. Widths are measured from the glyph pixels; crisp at any integer scale |
| `ParamRegistry`, `ParamGroup` | Typed, ranged, unit-annotated values; `describe()` is JSON |
| `Random` | Seeded PRNG: `next`, `range`, `int`, `pick` |
| `FixedClock` | Fixed-step accumulator with render interpolation |
| `Storage` | `localStorage` wrapper that never throws |
| `FrameStats` | Allocation-free frame interval / work timings |
| `clamp`, `lerp`, `damp`, `approach`, `overlaps`, `circlesOverlap` | Math helpers |

### Pixel fonts

`draw.text` uses **debuff sans** unless you pass a `font`, so text is crisp pixel art out of the box. Its source and a PNG sheet for other engines are in [fonts/debuff-sans](https://github.com/debuffjp/debuff/tree/main/fonts/debuff-sans). To use your own:

Draw glyphs on a grid in Aseprite (or any editor), one cell per character in `BitmapFont.ASCII` order (space to `~`, left to right), and save the sheet as `assets/font@6x9.png` with your cell size. Draw each glyph from its cell's left edge; the advance is measured from the rightmost opaque column.

```ts
const font = new BitmapFont({ frames: assets.frames("font"), chars: BitmapFont.ASCII });
draw.text("coins 3", 4, 4, { font, color: "#fbbf24" });
```

With the `aseprite()` CLI plugin you can keep the source as `assets/font@6x9.aseprite` and skip exporting; `@debuffjp/cli`'s `aseprite/new-font.lua` creates a blank sheet with the grid set up. See the [CLI README](../../tooling/cli/README.md#aseprite).

### Scale modes

- `fit` (default): fill the container, keep the aspect ratio.
- `integer`: whole device-pixel scales for crisp pixel art.
- `expand`: like `fit`, but the logical size grows along the spare axis instead of letterboxing.
- `pixel`: each logical unit is `pixelSize` CSS pixels (default 3, snapped to whole device pixels), and the logical size grows with the container, so a bigger window or monitor shows more of the game instead of bigger pixels. `width`/`height` are the minimum.
- `none`: logical size in CSS pixels.

With `expand` and `pixel`, `game.width` and `game.height` change on resize (`game.hooks.resize`), so lay out from them each frame.

Game code always uses logical units. The backing store follows `devicePixelRatio`.

## Start-up splash

Production builds open with a short "made with debuff" card. It lasts 1.6 seconds and any key skips it. A click or tap skips it too. It has no links or URLs, so games stay within portal rules (Poki, CrazyGames and others forbid links out of the game). **Publishing on Poki?** Poki requires games to have no splash screens at all, so turn it off with `splash: false`. It never shows in dev, or when time is driven by `step()` (scenarios and agents). To remove it:

```ts
new Game({ canvas, width, height, splash: false });
```

You can also set its length with `splash: { duration: 1 }`, or end it from code with `game.skipSplash()`.
