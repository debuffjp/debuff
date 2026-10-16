---
"@debuff/core": minor
---

`draw.clip(x, y, w, h, fn)` restricts drawing to a rectangle for UI panels, scrolling lists and minimaps. It's a GPU scissor on WebGL2 and a native clip on Canvas 2D, nested clips intersect, and the clip is restored even if `fn` throws.
