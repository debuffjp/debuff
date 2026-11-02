---
"spryte": patch
---

`draw.sprites` warns once per renderer when an array it gets is detached, which happens to a view of wasm memory after that memory grows. Before, it drew nothing with no message. The docs now say to recreate such views after growth or each frame.
