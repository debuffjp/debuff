---
"spryte": minor
---

`mask(draw, shape, fn)`: keep what `fn` draws only where `shape` draws. The mask can be anything you can draw (sprites with soft alpha, shapes, text), it nests, and it works inside render targets. A rectangle mask is pixel-identical to `clip()` on both backends.
