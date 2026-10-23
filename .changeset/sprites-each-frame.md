---
"spryte": minor
---

`draw.sprites` takes a frame per copy: pass a `Frame[]` as the first argument and index it with `each.frame`. A belt of different items or a swarm at different animation phases is one draw call instead of one call per frame. Frames on one image draw instanced; frames across images fall back to one quad per copy. The Canvas 2D fallback and `withShader` take the same path as before.
