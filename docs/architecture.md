# Architecture

## Two halves

| | Browser runtime (`packages/`) | Tooling (`tooling/`) |
| --- | --- | --- |
| Runs in | the player's browser | the developer's machine / CI |
| Priority | small, fast, predictable | helpful, inspectable, scriptable |
| Ships to players | yes, only what is imported | never |

The boundary is enforced: `debuff build` scans output for dev-only tokens and fails if any are found.

## Runtime packages

```text
@debuffjp/core     Game, FixedClock, Random, Scene, Camera, Sprite, ParamRegistry, Storage, FrameStats, math
@debuffjp/input    Input (actions over keyboard, pointer, gamepad), Keyboard, Pointer, Gamepads (no deps)
@debuffjp/assets   Assets loader (no deps)
@debuffjp/audio    Audio (no deps)
@debuffjp/tilemap  Tilemap, move (collision), fromTiled, fromLdtk (peer: core)
@debuffjp/juice    Tweens, Particles, Trail, squash (no deps)
@debuffjp/ui       Transition, Menu, panel (no deps)
@debuffjp/dev      devTools plugin, exposeDevHooks (depends on core; dev builds only)
```

Packages other than `dev` don't depend on each other unless they must. Games compose them, so a game that skips audio pays nothing for it.

### Loop model

- **Fixed-step simulation** (`FixedClock`, default 1/60 s) with render interpolation `alpha`. This makes scenarios reproducible.
- **Seeded RNG** on `game.random`. Effects take a random source so captures are stable.
- `game.freeze(s)` for hit-stop, `game.timeScale` for slow motion, typed lifecycle hooks on `game.hooks`.

### Plugins

`game.use(plugin)` installs a runtime plugin, which extends the game only through `hooks`, `params`, `inspect` and the other public services. See [plugins.md](./plugins.md) and ADR 0004.
- Pauses when the tab is hidden, and respects an explicit `stop()`.

### Rendering

Standard Canvas 2D (see ADR 0001). The canvas is sized to its container with `ResizeObserver`. The backing store tracks `devicePixelRatio`, game code always works in logical units, and `scale: "integer"` gives crisp pixel art.

## Tooling

- **CLI** (`@debuffjp/cli`): wraps Vite for dev/build. The debuff Vite plugin runs the asset pipeline over `assets/`, serves the manifest and referenced files in dev, and emits only those files in builds.
- **Config** (`debuff.config.ts`): lists tooling plugins (ADR 0004).
- **Asset compiler**: subfolders become preload groups, `name@WxH.png` declares a sprite grid, and content hashes are recorded. It never touches sources.
- **Scenarios**: JSON steps (`wait`, `press`, `tap`, `set`, `expect`, `capture`). They run against the dev server in a system Chromium via `playwright-core`, with screenshots diffed against baselines in `scenarios/__baselines__/`.

## Agent surface

| Need | Interface |
| --- | --- |
| What is in this project? | `debuff inspect --json` |
| What can I tune? | `__DEBUFF_DEV__.params()` (typed, ranged, unit-annotated) |
| What is happening now? | `__DEBUFF_DEV__.state()` → scene, tick, stats, `Scene.inspect()` |
| Did my change work? | `debuff scenario --json` |
| What does it cost? | `debuff build --json` |

An MCP adapter can wrap these later without new concepts (see roadmap).
