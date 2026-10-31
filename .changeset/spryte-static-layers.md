---
"spryte": minor
---

Static layers: `draw.record(fn)` keeps the sprites `fn` draws in a `Layer` without drawing them, and `draw.replay(layer)` draws them all again under the current transform. On WebGL2 a replay is one draw call per eight images, with the instances in a GPU buffer made once, so a tilemap or background costs no JavaScript per sprite. It puts the same pixels on screen as drawing the sprites one by one, pixel snapping included at fractional camera offsets and zoom (checked on a real GPU against direct drawing on both backends). `draw.alpha` applies at replay. On Canvas 2D, under a custom shader or `draw.alpha` below 1, replay draws the sprites one by one. After a context loss the layer's buffers are rebuilt; `layer.dispose()` frees them.
