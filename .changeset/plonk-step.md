---
"plonkjs": minor
---

`player.step`: where the music is now, in steps from the top of the song (fractional, counting up across loops, following `tempo()`; -1 when stopped). Read it each frame to move things in time with the music.
