# @debuffjp/core

Game loop, fixed-step clock, scenes, camera, sprites, typed creative parameters and a batched WebGL2 renderer with automatic Canvas 2D fallback. No dependencies.

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
| `Game` | Loop, scenes, scaling, `camera`, `random`, `params`, `stats`, `freeze()`, `timeScale`, `step(n)` |
| `game.use(plugin)`, `Plugin` | Install runtime plugins. See [docs/plugins.md](https://github.com/debuffjp/debuff/blob/main/docs/plugins.md) |
| `game.hooks` | `beforeUpdate`, `afterUpdate`, `beforeRender`, `afterRender`, `sceneChange`. Each returns an unsubscribe function |
| `game.inspect` | `register(name, () => json)` for dev tools and scenarios |
| `Scene` | `{ id, enter?, update?, render?, exit?, inspect? }` |
| `Camera` | Smoothed follow, deadzone, bounds, trauma shake, culling, `toWorld()` |
| `Sprite`, `sliceGrid` | Frames, named animations, origin, flip, impact flash |
| `draw.text`, `draw.measure` | Text with a CSS font or a `BitmapFont`; `measure` returns the box `text` fills |
| `BitmapFont` | Pixel font from a sprite-sheet grid. Widths are measured from the glyph pixels; crisp at any integer scale |
| `ParamRegistry`, `ParamGroup` | Typed, ranged, unit-annotated values; `describe()` is JSON |
| `Random` | Seeded PRNG: `next`, `range`, `int`, `pick` |
| `FixedClock` | Fixed-step accumulator with render interpolation |
| `Storage` | `localStorage` wrapper that never throws |
| `FrameStats` | Allocation-free frame interval / work timings |
| `clamp`, `lerp`, `damp`, `approach`, `overlaps`, `circlesOverlap` | Math helpers |

### Pixel fonts

Draw glyphs on a grid in Aseprite (or any editor), one cell per character in `BitmapFont.ASCII` order (space to `~`, left to right), and save the sheet as `assets/font@6x9.png` with your cell size. Draw each glyph from its cell's left edge; the advance is measured from the rightmost opaque column.

```ts
const font = new BitmapFont({ frames: assets.frames("font"), chars: BitmapFont.ASCII });
draw.text("coins 3", 4, 4, { font, color: "#fbbf24" });
```

A blank sheet with the grid set up: `aseprite -b --script-param w=6 --script-param h=9 --script-param out=assets/font.aseprite --script node_modules/@debuffjp/cli/aseprite/new-font.lua`, then export it with `aseprite -b assets/font.aseprite --save-as assets/font@6x9.png`.

### Scale modes

- `fit` (default): fill the container, keep the aspect ratio.
- `integer`: whole device-pixel scales for crisp pixel art.
- `none`: logical size in CSS pixels.

Game code always uses logical units. The backing store follows `devicePixelRatio`.

## Start-up splash

Production builds open with a short "made with debuff" card. It lasts 1.6 seconds and any key skips it. Clicking or tapping the card opens [debuff.jp](https://debuff.jp) in a new tab and skips it too. It never shows in dev, or when time is driven by `step()` (scenarios and agents). To remove it:

```ts
new Game({ canvas, width, height, splash: false });
```

You can also set its length with `splash: { duration: 1 }`, or end it from code with `game.skipSplash()`.
