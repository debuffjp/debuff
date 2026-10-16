# Foundation

Working notes for the code in this repo. The planning suite (`README.md`, `01-…21-*.md`)
is kept locally and is not tracked.

## Layout

| Path | Purpose |
| --- | --- |
| `packages/core` | Game loop, fixed-step clock, seeded RNG, scenes, creative params registry |
| `packages/input` | Keyboard state with per-step edge detection and programmatic input |
| `examples/sandbox` | Minimal Vite app exercising core + input; target for the first vertical slice |
| `scripts/check-boundary.mjs` | Fails if dev-only code reaches the production bundle; prints sizes |

## Commands

- `npm run dev` — run the sandbox with hot reload.
- `npm run check` — typecheck, unit tests, production build, boundary/size check.

## Decisions taken here (all reversible)

- npm workspaces, TypeScript project references, ESM, Vite, Vitest.
- Canvas 2D behind `Scene.render` for now. PixiJS vs Canvas is still open; benchmark on the
  vertical slice before committing.
- Simulation runs on a fixed step (`FixedClock`) with seeded `Random`, so scenarios can
  call `game.step(n)` and replay deterministically.
- Creative values live in `game.params` (typed, ranged, unit-annotated, JSON-describable),
  the first agent-inspectable surface.
- Dev hooks sit behind `import.meta.env.DEV`; the boundary check enforces it.

## Next steps

1. Pointer/touch input.
2. Sprites, asset manifest loader, and basic size report.
3. Scenario runner (headless browser, scripted input, screenshot capture).
4. `create-debuff` scaffold command.
5. Pick the vertical-slice game (art direction is the user's call).
