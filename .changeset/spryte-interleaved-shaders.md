---
"spryte": minor
---

`draw.sprites()` takes interleaved data. Set `each.stride` and `positions` becomes one record of `stride` floats per copy, uploaded to the GPU as is; `each.scale`, `rotation`, `color` and `frame` then take offsets into the record. `positions` must be a `Float32Array` and may view a `SharedArrayBuffer`, so a worker's buffer draws without a per-frame copy.

`sprites()` inside `withShader` now stays one instanced draw instead of one quad per copy: the effect is compiled against the per-copy program. Only `source(uv)`, `color` and `uv` are guaranteed inside `effect` there. Frames across images still draw one quad per copy.
