---
"spryte": minor
---

`draw.sprite` takes `user` and `user2` options: two floats a custom shader reads as `user()` and `user2()`, as `draw.sprites` copies already could through `each`. The sprite stays in the batch, so a per-sprite parameter (a share, a variant, a flag) no longer has to be packed into the tint. Sprites that set neither read 0. The values travel in a separate buffer that is uploaded only for a batch that uses them, so draws without a custom shader don't change. `spriteOptions()` includes the two new fields. Reported in #113.
