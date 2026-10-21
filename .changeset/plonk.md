---
"plonk": minor
"@debuffjp/audio": minor
---

New package, **plonk**: game music made in code. Songs are small data (instruments and patterns of notes), synthesized live with Web Audio: no audio files, about 2 kB brotli, any engine. Tempo changes without jumps, per-track layers that fade in and out, a tempo-synced echo, and `notes()` to see a song as data. `@debuffjp/audio` gains `audio.bus(name)`, so plonk (or anything else) can play through a game's music bus and share its mute.
