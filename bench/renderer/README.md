# Renderer benchmark

Compares [spryte](../../packages/spryte) (and debuff, which renders through it) with PixiJS 8 and raw Canvas 2D, on the same assets and the same deterministic simulation. Results and how to read them: [`packages/spryte/docs/benchmarks.md`](../../packages/spryte/docs/benchmarks.md). The decision record is ADR 0013.

```bash
npm run build                                              # the bench imports the built spryte and core
npm run bench:renderer                                     # bunny scene, every renderer, 3 rounds
npm run bench:renderer -- mixed                            # or: particles
npm run bench:renderer -- particles spryte-bulk pixi-particle rounds=5
BENCH_NOTE="Pixel 7, Chrome, battery saver off" npm run bench:renderer   # anything the runner can't detect
PARITY_DUMP=1 npm run bench:renderer -- particles          # write the parity frames and diffs to results/parity/
```

## Scenes

| Scene | What every sprite does | Renderers |
| --- | --- | --- |
| `bunny` | One texture, position only | `canvas2d`, `spryte`, `spryte-bulk`, `debuff-2d`, `debuff-webgl`, `pixi-sprite`, `pixi-particle` |
| `mixed` | 4 separate textures, rotation, scale, tint, alpha | `spryte`, `debuff-webgl`, `pixi-sprite` |
| `particles` | One texture; position, scale, rotation, tint and alpha all changing every frame | `spryte-bulk`, `pixi-particle` (every dynamic property on) |

Like for like: `spryte` (`draw.sprite`, one call per sprite) pairs with `pixi-sprite` (`Sprite`). `spryte-bulk` (`draw.sprites`) pairs with `pixi-particle` (`ParticleContainer`). All use nearest filtering, no antialiasing, and whole-pixel rounding (PixiJS with `roundPixels: true`).

## Method

1. **Parity.** On a fresh page, each renderer draws the same seeded frame (2,000 sprites after 10 steps). Its pixels are compared with the reference renderer's. **Coverage** (drawn area relative to the reference) shows whether a renderer skips or culls work. **Differing pixels** (any channel off by more than 8 levels) are mostly sprite edges where rounding rules differ.
2. **Timing.** Each count runs 20 warm-up frames and 100 measured frames. A frame is timed from simulation to GPU completion, forced by a 1-pixel readback, so vsync and rAF pacing can't hide cost. Counts climb a ladder (1k, 2k, 5k, 10k, … 1.6M) until the median frame exceeds 16.7 ms.
3. **Rounds.** The whole ladder repeats for several rounds, with the renderer order rotated each round so heat and ordering spread evenly. Reported: the median across rounds, with min–max. "Max at 60 fps" is the largest count whose median fits 16.7 ms in every round.
4. **Environment.** Saved with every result: GPU, Chrome version, CPU, OS, memory, power source and plan (detected on Windows), the PixiJS version, the spryte version and commit, and `BENCH_NOTE`.

Results go to `results/<date>-<platform>-<scene>.json`. Commit results from new devices: phones and integrated GPUs especially.
