---
"@debuff/core": minor
---

Games now open with a short "made with debuff" card in production. It lasts 1.6 seconds, any input skips it, and it respects reduced motion. It's drawn with `draw`, so it needs no assets. It never shows in dev or in stepped runs (scenarios and agents). Pass `splash: false` to remove it, or `splash: { duration }` to change its length.
