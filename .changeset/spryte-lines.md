---
"spryte": minor
---

Add `lines(draw, segments, count?, options?, each?)`: many lines in one call, for graph edges, grids and vector fields. `segments` is x1, y1, x2, y2 per line. On WebGL2 it's one instanced draw call and a `Float32Array` is uploaded as is; options set a shared `width`, `color` and `alpha`, and `each` adds a per-line `width` or `color`. Each line lands on the pixels `line()` draws with the same values. On the Canvas 2D fallback each line is drawn with `draw.line()`. Import it from `spryte` like `polyline`: apps that don't use it don't bundle it.
