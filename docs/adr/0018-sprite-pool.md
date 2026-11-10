# ADR 0018: A sprite pool over draw.sprites, for big scenes without a call per sprite

- Status: proposed
- Date: 2026-11-11
- Related: ADR 0013 (spryte; bulk drawing is part of the API)

## Context

`draw.sprite` costs JavaScript per call. On 2026-11-11, after three fixes to that path (pixel snapping, a smaller `Draw.sprite` so V8 inlines it, `spriteOptions()`), 200k unrotated sprites still took 14.7 ms a frame in 2dbench's bunny scene (RTX 5060 Laptop, Chrome). Bulk position-only `draw.sprites` took 2.7 ms for the same count in the 2026-10-28 run. A CPU profile put about 60-70% of the `draw.sprite` frame in submission: option reads, the call chain and writing 56 bytes per sprite.

The call path is also fragile. How fast it runs depends on V8 heuristics a game can't see: whether the chain fits V8's inlining budget (920 bytes of bytecode, 460 per function), and whether the game's options objects stay within four shapes. Five shapes made 200k calls 2.5 times slower in Node. `test/v8-budget.test.ts` now guards the first; `spriteOptions()` mitigates the second.

`draw.sprites(frame, positions, count, options, each)` already avoids all of this. It uploads typed arrays as is, with per-copy `scale`, `rotation`, `color` and `frame`. What it doesn't do, compared with a `draw.sprite` loop:

- Frames must share one image. Frames across images fall back to one quad per copy.
- There's no per-copy flip, origin, flash or alpha separate from colour.
- The arrays are the game's to manage: growing them, removing a dead entity, keeping `count` right.

## Options

| | What | For | Against |
| --- | --- | --- | --- |
| A | Docs only: point big scenes at `draw.sprites` | No new API | Games keep hand-rolling array management, and the per-copy gaps stay |
| B | `SpritePool`: a class that owns `draw.sprites`'s arrays, with `add()` returning an index, swap-remove `remove(i)`, growth, and `draw(pool)` | Same GPU path as today, so nothing new to verify on the GPU; fixes the ergonomics | Still one image per pool; per-copy flip and flash still missing |
| C | B plus new per-copy fields (`flags` for flips, `flash`, `alpha`) in the copy pipeline | Covers most of what `draw.sprite` options do | New vertex attributes and shader work; each needs a pixel-parity check against `draw.sprite` |
| D | A retained scene graph: sprites as objects spryte keeps between frames | Familiar from PixiJS | Contradicts spryte's immediate-mode design (ADR 0007); objects per sprite bring back the property-read costs |

## Proposal

B first, C only where a game needs it. The pool is a thin owner of the arrays `draw.sprites` already takes, so its speed is the measured 2.7 ms per 200k, and the GPU path stays the one `browser-test` already checks. Fields a game doesn't use aren't allocated, so a position-only pool costs 8 bytes per sprite as now.

Before building: write the pool as an example in `packages/spryte/examples` against today's `draw.sprites`, port one dogfooding scene to it, and measure. If the example is short and fast, ship it as API; if it needs C's fields to be useful, decide C then.

## Prototype (2026-11-11)

`packages/spryte/examples/pool` holds the pool (`pool.ts`, about 150 lines) and a page of bouncing sprites that draws them either with the pool or with a `draw.sprite` loop (`?mode=loop`). Handles are stable: `add()` returns one, `remove(handle)` swaps the last entry into the gap, and `slot(handle)` finds the data. A randomised run of 200k adds and removes kept every handle pointing at its own data.

Measured with `?n=200000&bench` in Chrome, three alternating runs each. The frame is simulation plus draw calls, timed on the CPU without waiting for the GPU:

| | Median frame |
| --- | --- |
| SpritePool (per-copy colour) | 1.4, 1.7, 1.8 ms |
| `draw.sprite` loop (four tint objects) | 13.8, 14.1, 15.8 ms |

So the pool takes about a ninth of the CPU time. What the prototype showed:

- Data a game keeps per sprite (velocity here) has to follow the swap on remove. The example does this by hand; a real API needs a hook for it, or the pool should own extra columns.
- Removing changes draw order. That's fine for particles and swarms, and wrong for anything sorted by depth.
- A position-only pool still goes through `draw.sprites`' fast path, because `each` fields that are `undefined` don't count as per-copy fields.

## Open questions

- Draw order: a pool draws in one call, so sprites in it can't interleave with other draws. Is a pool per layer enough for real games?
- Multi-image pools: one draw call per image, or require atlases?
- Name and home: `SpritePool` in spryte, or a debuff helper over spryte?
