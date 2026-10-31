---
"spryte": minor
"@debuffjp/core": minor
---

Custom shaders get `frameUv()`: the position inside the drawn frame, from (0, 0) at the top left to (1, 1) at the bottom right. `uv` stays in atlas space, so effects shaped to a sprite no longer need the frame's atlas rect passed as a uniform. `@debuffjp/core` now re-exports the `Shader` and `UniformValue` types.
