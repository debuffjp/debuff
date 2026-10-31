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
| `smoothMotion(game, objects)` | Draw moving objects between fixed steps without keeping `prevX`/`prevY` yourself; see [Smooth motion](#smooth-motion-between-steps). Added in 0.26 |
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
| `SpatialHash` | A grid for "what's near this" queries (`near`, `nearest`), rebuilt each step; see [Finding what's near](#finding-whats-near). Added in 0.26 |

### Finding what's near

Checking every enemy against every shot is fine for a few dozen. For hundreds, put them in a `SpatialHash` once per step and ask only about the cells around a point. Added in 0.26:

```ts
import { SpatialHash } from "@debuffjp/core";

const grid = new SpatialHash<Enemy>(24); // cell size: about the radius you query most

// in update, after things moved:
grid.rebuild(enemies);
for (const shot of shots)
  grid.near(shot.x, shot.y, 12, (e) => {
    hit(e, shot);
    return true; // stop at the first
  });
const target = grid.nearest(player.x, player.y, 200, (e) => !e.dead);
```

`near` visits every item whose centre is within the radius, with the squared distance; `nearest` returns the closest one `accept` allows. Items are points, so for large ones query with the radius plus their size. Results come in a fixed order, so replays stay deterministic, and after the first steps it allocates nothing. Rebuilding while a query runs isn't allowed; a query inside another query's callback is fine. On a crowd-separation workload (every enemy querying 16 px around itself) it measured about 4 to 15 times faster than checking every pair, for 500 to 2,000 enemies.

### Smooth motion between steps

The simulation runs at a fixed 60 Hz, and `render(draw, alpha)` gets how far the frame is between the last step and the next (0 to 1). Drawn at their positions, moving objects jump on displays faster than 60 Hz. The camera already blends by `alpha`; `smoothMotion` does it for your objects, added in 0.26:

```ts
import { smoothMotion } from "@debuffjp/core";

const smooth = smoothMotion(game, () => [player, enemies, shots]); // objects, or arrays of them

// in render:
draw.sprite(heroImg, smooth.x(player), smooth.y(player));
for (const e of enemies) draw.sprite(enemyImg, smooth.x(e), smooth.y(e));

// after moving something instantly (respawn, warp), so it doesn't streak for a step:
smooth.snap(player);
```

It saves each object's position before every step, so new objects need no registering and removed ones no clean-up. Something it hasn't saved yet (just created, or after `snap`) is drawn where it is. It only reads positions, so replays and tests are unaffected, and only `x` and `y` blend.

While the game is frozen (`game.freeze()`), nothing moves between steps, so from 0.26 `render` and the render hooks get `alpha` 1 and the camera draws where it is. Before 0.26 they got the leftover time, so the camera and anything blended by `alpha` wobbled on every frame of a hitstop.

### Pixel fonts

`draw.text` uses **debuff sans** unless you pass a `font`, so text is crisp pixel art out of the box. Before 0.6 the default was the browser's `8px monospace`; pass `font: "8px monospace"` to keep that look. Its source and a PNG sheet for other engines are in [fonts/debuff-sans](https://github.com/debuffjp/debuff/tree/main/fonts/debuff-sans). To use your own:

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

Production builds open with a short "made with debuff" card. It lasts 1.6 seconds and any key skips it. A click or tap skips it too (before 0.5, a click opened debuff.jp and the card showed its URL). It has no links or URLs, so games stay within portal rules (Poki, CrazyGames and others forbid links out of the game). **Publishing on Poki?** Poki requires games to have no splash screens at all, so turn it off with `splash: false`. It never shows in dev, or when time is driven by `step()` (scenarios and agents). To remove it:

```ts
new Game({ canvas, width, height, splash: false });
```

You can also set its length with `splash: { duration: 1 }`, or end it from code with `game.skipSplash()`.
