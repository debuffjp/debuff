# @debuff/core

Game loop, fixed-step clock, scenes, camera, sprites, typed creative parameters and a batched WebGL2 renderer with automatic Canvas 2D fallback. No dependencies.

```bash
npm install @debuff/core
```

```ts
import { Game } from "@debuff/core";

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
| `ParamRegistry`, `ParamGroup` | Typed, ranged, unit-annotated values; `describe()` is JSON |
| `Random` | Seeded PRNG: `next`, `range`, `int`, `pick` |
| `FixedClock` | Fixed-step accumulator with render interpolation |
| `Storage` | `localStorage` wrapper that never throws |
| `FrameStats` | Allocation-free frame interval / work timings |
| `clamp`, `lerp`, `damp`, `approach`, `overlaps`, `circlesOverlap` | Math helpers |

### Scale modes

- `fit` (default): fill the container, keep the aspect ratio.
- `integer`: whole device-pixel scales for crisp pixel art.
- `none`: logical size in CSS pixels.

Game code always uses logical units. The backing store follows `devicePixelRatio`.
