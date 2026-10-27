# plonk

## 0.3.1

### Patch Changes

- 70a00c9: npm homepage links to the package's page on debuff.jp.

## 0.3.0

### Minor Changes

- ec15658: `player.step`: where the music is now, in steps from the top of the song (fractional, counting up across loops, following `tempo()`; -1 when stopped). Read it each frame to move things in time with the music.

## 0.2.0

### Minor Changes

- b44af49: plonk learns to sound good, and to check that it does. A master bus (gentle compressor, then a limiter: the mix can't clip), a seeded reverb, and stereo `pan` per instrument. Musical vocabulary: song `key` and `transpose`, scale degrees (`^3@5`), chord names (`Am7@3`), accents (`!`), ghost notes (`_`), chances (`?`, `?30`, seeded), and tracks that take turns between variants (fills). `player.sfx()` plays a sound effect by scale degree in the song's key, optionally on the next step, beat or bar. And `render()`, `analyse()` and `mix()` measure music without ears: loudness (ITU-R BS.1770 LUFS), peaks and clipping, spectrum balance, and each track's level against the mix, with warnings in plain words. `notes()` caches each song's layout (60x faster).
- 8840cfb: New package, **plonk**: game music made in code. Songs are small data (instruments and patterns of notes), synthesized live with Web Audio: no audio files, about 2 kB brotli, any engine. Tempo changes without jumps, per-track layers that fade in and out, a tempo-synced echo, and `notes()` to see a song as data. `@debuffjp/audio` gains `audio.bus(name)`, so plonk (or anything else) can play through a game's music bus and share its mute.
