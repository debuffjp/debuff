---
"spryte": patch
---

Ten fixes from a review of the whole package:

- `roundRect` lost its last corner at radii of about 18 device pixels or more: the point buffer was half the size it needed.
- The text cache for strings that get their own canvas (the Canvas 2D fallback, and tall strings on WebGL2) grew without bound while text kept changing. It now holds at least 256 strings, plus whatever is on screen.
- An image drawn before it finished loading stayed invisible: its 0×0 size and empty texture were cached for good. Both are now read again once it has loaded.
- `draw.invalidate(src)` also forgets the source's size, so a resized canvas draws at its new size.
- `mask()` and `filter()` inside `draw.clip()` on Canvas 2D leaked the clip's `save()` every frame, and on WebGL2 a filter's first pass was cleared only inside the clip, so its blur sampled stale pixels at the edges.
- `into()`, `mask()` and `filter()` nested inside a mask or filter at a render scale other than 1 drew at the wrong scale: the outer size was taken in pixels instead of logical units.
- `into()` with a translucent clear colour on WebGL2 cleared with straight alpha instead of premultiplied, so the colour came out too bright and differed from Canvas 2D.
- A target the GPU refuses (too large, or an incomplete framebuffer) no longer leaves `into()`'s transform, clips, alpha and render scale changed.
- Shared mode: a render target first drawn as an image (never drawn into) rebound the canvas instead of the host's framebuffer for the rest of the frame.
