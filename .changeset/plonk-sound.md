---
"plonk": minor
---

plonk learns to sound good, and to check that it does. A master bus (gentle compressor, then a limiter: the mix can't clip), a seeded reverb, and stereo `pan` per instrument. Musical vocabulary: song `key` and `transpose`, scale degrees (`^3@5`), chord names (`Am7@3`), accents (`!`), ghost notes (`_`), chances (`?`, `?30`, seeded), and tracks that take turns between variants (fills). `player.sfx()` plays a sound effect by scale degree in the song's key, optionally on the next step, beat or bar. And `render()`, `analyse()` and `mix()` measure music without ears: loudness (ITU-R BS.1770 LUFS), peaks and clipping, spectrum balance, and each track's level against the mix, with warnings in plain words. `notes()` caches each song's layout (60x faster).
