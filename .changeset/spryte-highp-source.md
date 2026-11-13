---
"spryte": minor
---

`source(uv)` in custom shaders now takes a `highp` uv, as do spryte's built-in effect and blur. Shaders run under `precision mediump float`, so before this a texture read through `source()` was addressed at fp16 on many mobile GPUs and sampled the wrong texels in images past about 1024 px, whatever precision the effect declared. The documented signature is now `vec4 effect(vec4 color, highp vec2 uv)`; an unqualified `vec2 uv` still compiles but stays mediump. Reported in #110.
