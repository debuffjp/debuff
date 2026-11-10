# ADR 0019: Rendering in a worker with OffscreenCanvas

- Status: proposed
- Date: 2026-11-11
- Related: ADR 0013 (spryte), ADR 0018 (sprite pool)

## Context

The main thread runs the game's simulation, input, audio scheduling and DOM work, then spryte's draw calls. In 2dbench at 200k sprites, submitting the draw calls was about 60-70% of each frame. Simulation is cheap in the benchmark (1-3 ms) but not in every game. When both are heavy, a worker could run one while the main thread runs the other, and a frame would take about as long as the slower of the two instead of their sum.

Measured on 2026-11-11 (RTX 5060 Laptop, Chrome): restricting every draw to a 1x1 scissor didn't change frame times in bunny, mixed, tilemap or particles, so these scenes aren't limited by pixel work. The cost is on the CPU and in moving data to the GPU, which is the part a worker could overlap.

What spryte supports today:

- `createRenderer` is typed for `HTMLCanvasElement` only. Internally, spryte already creates `OffscreenCanvas` for text and circle textures when one exists.
- `drawElement` (HTML in canvas) needs the DOM and can't work in a worker.
- debuff's `Game` owns the loop, input and DPR scaling on the main thread.

## Options

| | What | For | Against |
| --- | --- | --- | --- |
| A | Whole game in a worker: `canvas.transferControlToOffscreen()`, input forwarded by `postMessage` | No shared state, no special headers; the main thread stays free for the page | Game code can't touch the DOM; debuff's `Game`, input and audio would need worker-aware versions; Web Audio isn't available in workers |
| B | Render-only worker, game state in a `SharedArrayBuffer` | Overlaps simulation with rendering; game code stays on the main thread | Needs COOP/COEP headers on every host (itch.io, Wavedash, portals), state as typed arrays, and frame-to-frame synchronisation |
| C | Render-only worker, state transferred each frame (`postMessage` with transferables) | No headers | Copies or ping-pongs buffers every frame; a frame's latency grows by one message |
| D | Stay on the main thread; make submission cheaper (ADR 0018) | No new constraints | No overlap |

## Proposal

D now, A as an opt-in later, B and C not yet.

- ADR 0018's pool attacks the same cost (CPU time submitting sprites) without threading, and benefits every host.
- A is the lowest-risk worker mode: spryte's part is small (accept an `OffscreenCanvas` in `createRenderer`, keep `drawElement` returning false there). debuff's part, a worker-aware `Game`, is the larger job and should wait for a game that needs it.
- B's header requirement would make debuff games fail on hosts that don't send COOP/COEP, so it isn't a default.

Before building A: accept `OffscreenCanvas` in `createRenderer`'s type, run `browser-test` in a worker, and port one dogfooding game to measure the overlap on a real workload.

## Open questions

- Which hosts that debuff games ship to send COOP/COEP, or allow setting them?
- Audio stays on the main thread in A; how much latency does forwarding sound events add?
