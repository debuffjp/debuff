---
"spryte": patch
---

Unrotated pixel-art sprites cost less CPU. Snapping each one to whole pixels used `Math.round`, which V8 runs slowly. spryte now uses `Math.floor(v + 0.5)`, which rounds the same way. In 2dbench's bunny scene (200k unrotated `draw.sprite` calls, RTX 5060 Laptop, Chrome), the median frame went from 18.6 ms to 14.6 ms over 5 interleaved rounds, and pixel parity held. Rotated and smooth sprites never took that path, so they're unchanged.
