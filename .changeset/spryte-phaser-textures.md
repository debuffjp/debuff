---
"spryte": minor
---

`spryteExtern` draws images Phaser already loaded from Phaser's own GPU textures, so a texture shared by both is no longer uploaded twice. `createSharedRenderer` takes a `borrow` option that lets any host engine lend its textures the same way.
