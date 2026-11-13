---
"spryte": minor
---

`Shader.set()` with the value a uniform already has no longer ends the batch. Numbers and arrays compare by value; a texture, or the same array object passed again (its contents may have changed), still flushes. The Shader docs now say that a shader switch and a uniform change each end a batch, and show the pattern for per-sprite values: one `withShader` around the whole walk. Reported in #109.
