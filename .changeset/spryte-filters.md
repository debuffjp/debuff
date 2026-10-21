---
"spryte": minor
---

Filters: `draw.filter(filters, fn)` draws `fn` through a chain of ready-made effects: `blur()`, `grayscale()`, `sepia()`, `saturate()`, `hueRotate()`, `brightness()`, `contrast()`, `invert()` and `colorMatrix()`. Each is tree-shakeable. On Canvas 2D the named filters use the browser's CSS filters, which WebGL2 matches to within 2 levels per channel.
