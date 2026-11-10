---
"spryte": minor
"@debuffjp/core": minor
---

`spriteOptions(o)` builds `draw.sprite` options with every field present (`undefined` for a default), so all of a game's options objects share one shape. V8 caches `draw.sprite`'s property reads for up to four shapes, and a game passing `{ rotation }` in one place, `{ tint }` in another and `{}` elsewhere goes past that. With eight shapes, 200k `draw.sprite` calls took 13.9-14.7 ms in Node 22; the same eight built with `spriteOptions` took 7.1-8.4 ms. Build each object once and change its fields in place. A game that only ever passes one or two shapes doesn't need it. `@debuffjp/core` re-exports it. The fields of `SpriteDrawOptions` now accept `undefined` explicitly, which means the default as before.
