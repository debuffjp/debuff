# ADR 0007: WebGL2 batched rendering as the performance path

- Status: accepted
- Date: 2026-10-16
- Amends: ADR 0001 (Canvas 2D first)

## Context

ADR 0001 chose Canvas 2D until a benchmark said otherwise. The goal is to be the fastest practical choice for 2D web games, so we measured.

**Benchmark:** `bench/renderer` (`npm run bench:renderer`), a bunnymark of N 16×16 textured sprites under identical, deterministic simulation. Each frame is timed from simulation to GPU completion (forced by a GPU sync point), so vsync can't hide cost. "Max at 60 fps" is the largest tested count whose median frame fits 16.7 ms.

**Result** (2026-10-16; Windows 11, Chrome, ANGLE D3D11, RTX 5060 Laptop GPU):

| Renderer | Max sprites at 60 fps | Frame at 10k | Frame at 50k |
| --- | --- | --- | --- |
| Canvas 2D `drawImage` (current debuff) | ~10,000 | 15.6 ms | 92 ms |
| **debuff WebGL2 instanced prototype** | **~400,000** | **0.7 ms** | **1.4 ms** |
| PixiJS v8 `Sprite` | ~50,000 | 2.6 ms | 12.5 ms |
| PixiJS v8 `ParticleContainer` | 200,000–400,000 | 0.7 ms | 1.8 ms |

Raw data: `bench/renderer/results/`.

**Implemented** (same day), measured through the public API (`Game` + `draw.sprite`, renderer `debuff-webgl` in `bench/renderer`) after removing hot-path allocations:

| Renderer | Max sprites at 60 fps | Frame at 10k | Frame at 50k |
| --- | --- | --- | --- |
| debuff `draw` on WebGL2 | **~200,000** | 1.1 ms | 3.9 ms |
| debuff `draw` on the Canvas 2D fallback | ~5,000 | 20.8 ms | 141.6 ms |

The public API costs about 2× the bare prototype (transforms, options, tint, flash, multi-texture batching). It's 4× PixiJS `Sprite` and level with PixiJS `ParticleContainer` at the 60 fps threshold, while staying a general-purpose sprite API.

## Caveats

- One machine, one browser. Integrated GPUs and phones will be slower, and the ratios may differ. We'll publish results from more devices.
- The ladder is coarse (×2 steps), so "max" is a lower bound within 2×.
- The prototype only draws one texture with no scene graph, filters or text. It's comparable to Pixi's `ParticleContainer`, not to full `Sprite`. Features will add cost, and we have to keep measuring.
- Bunnymark measures sprite throughput, not every workload (text, paths and gradients favour Canvas 2D).

## Decision

1. **WebGL2 instanced batching is debuff's primary renderer.** Canvas 2D is 20–40× slower at sprite throughput, which matters for particles, bullets, tilemaps and juice.
2. **A small drawing API (`draw`) over both backends.** Scenes draw through `draw.sprite()`, `draw.rect()`, `draw.text()` and so on, so the same game code gets WebGL2 speed, with Canvas 2D as the automatic fallback where WebGL2 is unavailable. The API stays deliberately small, with no scene graph, in the spirit of immediate-mode game drawing.
3. **Escape hatches stay.** Advanced users get the raw `WebGL2RenderingContext` (WebGL backend) or `CanvasRenderingContext2D` (2D backend), without pretending the two are interchangeable (ADR 0001's principle).
4. **The benchmark is a regression gate.** It runs on demand and before releases, and results go in the repo. Performance claims in docs must cite it.

## Consequences

- `Scene.render(ctx)` changes to `Scene.render(draw)`. This is breaking, and fine pre-1.0.
- `Sprite`, `Particles`, `Trail` and the camera render through `draw`, gaining batching for free.
- Text on WebGL needs a texture-cached path; it's measured separately.
- WebGPU is a future option behind the same `draw` API once it's broadly available and a benchmark justifies it.
