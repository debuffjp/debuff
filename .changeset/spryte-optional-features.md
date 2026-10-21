---
"spryte": minor
---

Shapes, masks, filters, `nineSlice` and `tiled` are standalone functions that take the `Draw` (`roundRect(draw, …)`, `mask(draw, shape, fn)`), so apps only ship what they use. spryte's startup JS is 11.3 kB brotli without them (a minimal app, `bench/size`).
