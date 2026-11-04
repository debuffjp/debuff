---
"spryte": patch
---

Warn once in development when `draw.sprites` gets `each.frame` frames from more than one image. Those copies draw one quad each instead of one instanced call, and before 0.12.3 nothing said so. Put the frames on one atlas to keep it one call.
