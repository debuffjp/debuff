---
"spryte": patch
---

Snap bitmap glyphs to whole logical pixels after scale and translation, matching pixel-art sprites on WebGL2 and Canvas 2D. Before 0.12.2, only local positions were rounded, so centred or right-aligned text could land between pixels under a fractional parent translation. Rotated and skewed text keeps its transformed positions.
