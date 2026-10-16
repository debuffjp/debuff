# Renderer benchmark

A bunnymark (N bouncing 16×16 textured sprites, deterministic simulation) comparing:

- `canvas2d`: Canvas 2D `drawImage`
- `debuff-webgl`: debuff's WebGL2 instanced batcher prototype (`src/webgl-batcher.ts`)
- `pixi-sprite` / `pixi-particle`: PixiJS v8 `Sprite` and `ParticleContainer`

```bash
npm run bench:renderer                      # all
npm run bench:renderer -- debuff-webgl      # one
```

Each frame is timed from simulation through GPU completion, so vsync doesn't hide cost. It reports the largest count that fits 16.7 ms, plus frame cost at 10k and 50k. Results are saved to `results/` with the GPU string. Commit results from new devices. See ADR 0007 for interpretation and caveats.
