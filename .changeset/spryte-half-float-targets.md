---
"spryte": minor
---

Render targets can hold values above 1. `draw.createTarget(w, h, { format: "rgba16f" })` stores half floats where WebGL2 has `EXT_color_buffer_float` or `EXT_color_buffer_half_float`, and falls back to `rgba8` elsewhere; `target.format` says which you got and `draw.supportsTarget(format)` asks without making one.
