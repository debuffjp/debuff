---
"spryte": minor
---

`draw.sprites` takes `each.user`, one float per copy (an array, or an offset into the record with `stride`). A custom shader reads it as `user()`: a copy's place in a row for a staggered effect, a particle's age, a tile variant. `user()` is 0 for anything that isn't a `draw.sprites` copy. The default program ignores the value, and so does the Canvas 2D fallback. Its cost on the instanced path hasn't been measured yet.
