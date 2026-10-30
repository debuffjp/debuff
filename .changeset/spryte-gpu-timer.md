---
"spryte": minor
---

New `gpuTimer(draw)`: GPU milliseconds for what you draw between its `begin()` and `end()`, to tell a GPU-bound frame from a CPU-bound one. Results arrive a few frames late and never block. `ms` stays `undefined` where timing isn't available (Canvas 2D, and browsers without `EXT_disjoint_timer_query_webgl2`, which in practice means everything but Chromium on desktop), after a GPU timing glitch, and when a host engine or profiler is already timing the frame. Separately imported, so it adds nothing unless used.
