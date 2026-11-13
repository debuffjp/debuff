---
"@debuffjp/core": minor
---

`GameOptions.blendSpace` passes spryte's `blendSpace` to the renderer, so a debuff game can turn on linear-light blending with `new Game({ ..., blendSpace: "linear" })`. Before this, `Game` created the renderer with only `backend` and `smooth`. Reported in #112.
