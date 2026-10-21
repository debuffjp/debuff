---
"spryte": minor
---

`draw.nineSlice()` for UI panels that stretch without stretching their corners, and `draw.tiled()` for repeating fills (scrolling backgrounds, floors) that work on frames inside an atlas. Both are plain quads, so they batch with sprites, run through custom shaders and match on both backends.
