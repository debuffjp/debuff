# ADR 0011: a frame profiler that explains hitches in any web game

- Status: accepted
- Date: 2026-10-18

## Context

Browser DevTools profile pages, not games. They answer "where did CPU time go during this recording", but game developers ask different questions:

- Which frames did the player feel drop, and how often (p95 and p99 frame time, not averages)?
- Why did frame 1,204 take 41 ms? Was it my script, garbage collection, a texture upload, layout, or the GPU?
- Which system (physics, AI, render) is eating the frame budget, and in which scene?
- Did my last change make the game slower, according to CI rather than gut feel?

Today you open the Performance panel, record, and read a flame chart. Nothing captures continuously, nothing names the culprit in plain words, and nothing fails CI on a frame-time regression.

debuff already has the start of this. `@debuffjp/dev`'s `FrameRecorder` keeps a ring buffer of interval, update, render, steps, draw calls and long tasks. The MCP server exposes it as `game_frames`, and there's an `explain-stutter` prompt. But it only works for debuff games, and it can't attribute a slow frame to a cause.

The browser now has the pieces to do much better:

- **Long Animation Frames API** (`long-animation-frame` entries, Chromium 123+). Each frame over 50 ms reports its scripts, with source URL, function name, character position and duration, plus time spent in style and layout and how long rendering was blocked. This is attribution that DevTools-free tooling has never had.
- **`requestAnimationFrame` wrapping.** It catches every engine's frame boundaries without knowing the engine.
- **WebGL wrapping.** It counts draw calls, texture uploads (`texImage2D` and similar, with bytes), buffer uploads, shader compiles and state changes for any engine.
- **GPU timing** with `EXT_disjoint_timer_query_webgl2`, where the browser offers it.
- **Heap sampling** with `performance.memory` (Chromium). A sharp drop between frames is a strong garbage-collection signal.

## Decision

**myaku** (脈, "pulse"), a standalone, engine-agnostic profiler (`myaku` on npm, in `packages/myaku`). Like keiko, it lives in this repo and depends on nothing from debuff. debuff integrates it deeply.

**Capture (in the browser, dev builds only).**
- Wrap `requestAnimationFrame` to mark frame boundaries. Frame interval is what the player feels; CPU time per frame is what the game costs.
- Wrap WebGL1/2 and Canvas 2D contexts to count draw calls, uploads (with byte sizes) and shader compiles per frame.
- Observe `long-animation-frame` and `longtask` entries, plus heap deltas, and attach them to the frame they overlap.
- Optional spans, so games can name their own systems: `profiler.span("physics", () => …)` or `begin`/`end`. Engine adapters add these automatically: debuff's hooks, Phaser's `preupdate`/`postrender`, PixiJS's ticker and render, three.js's `renderer.info`.
- Everything goes into fixed-size typed-array ring buffers, so the profiler never allocates per frame and doesn't cause the GC it is trying to detect. The overhead target is under 0.2 ms per frame.

**Explain.** Every hitch (a frame over budget, by default 1.5x the display's refresh interval) gets a verdict in plain words, ranked by evidence:

> Frame 1,204 took 41 ms (budget 16.7). 28 ms was script: `spawnWave` at src/enemies.ts:88, via Long Animation Frames. 3 textures (12 MB) were uploaded this frame. Likely cause: creating textures while playing. Preload them in the scene's load step.

The causes it recognises are: your script (with location), garbage collection (heap drop and no script), texture or buffer uploads, shader compiles, layout and style, GPU bound (GPU time over budget while CPU is idle), catch-up steps (the fixed-step loop ran several updates), and "outside the page" (a tab switch or the browser). When the evidence is thin, it says so instead of guessing, the same rule `explainError` follows.

**Surfaces.**
- **Overlay:** a frame-time graph with hitch markers. Click a spike to see its verdict. debuff's dev overlay embeds it.
- **Report:** `npx myaku record` drives a real browser (Playwright, optionally with CPU throttling), plays a scenario or keiko-style script, and writes a JSON report and an HTML page. The report has percentiles, hitches with verdicts, a per-system breakdown and a per-scene breakdown.
- **Budgets in CI:** `myaku.config` sets limits such as `p95 < 16.7ms`, `hitches per minute < 1` or `uploads during play = 0`. The run fails like a test does, and a comparison against a saved baseline shows the regression.
- **Agents:** debuff's MCP `game_frames` becomes `game_profile`, which returns verdicts, not raw numbers, and the `explain-stutter` prompt uses it.

**Out of scope for v1:** WebGPU timing, worker and thread profiling, network waterfalls, memory leak hunting beyond the GC signal, and non-Chromium attribution. In Firefox and Safari, capture still works but verdicts have no script locations.

## Consequences

- Script attribution needs Chromium. CI runs Chromium anyway; the docs say clearly what each browser gets.
- Wrapping WebGL costs a little per call. It's dev-only and can be switched off, and the overlay reports the profiler's own overhead.
- `FrameRecorder` in `@debuffjp/dev` becomes a thin adapter over the profiler, so debuff and other engines share one implementation.
- Real-browser runs (Playwright) are tooling-only dependencies. Nothing ships to players.
- Timings vary between machines. CI budgets compare against a baseline from the same runner, and the report records the machine and throttling used.

## Scope of v1

Capture, verdicts, the overlay, the JSON report (`profiler.report()`, and `window.__MYAKU__` for tools) and debuff's MCP `game_profile`. Then `npx myaku record` with CI budgets (`--p95`, `--p99`, `--hitches`): it injects myaku into the page through Playwright request interception, so it needs no changes to the game and works on production builds. The CLI lives in `packages/myaku/cli` with its own build; nothing in the browser entry points imports it, and its one dependency, `playwright-core`, is only used there. GPU timer queries and the HTML report come after.
