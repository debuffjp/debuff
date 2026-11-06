---
"plonkjs": patch
---

`player.stop(fade)` fades the music out. Before, it disconnected every instrument's layer at once, so the music cut dead and only the echo and reverb tails faded. A `layer()` volume set while nothing plays now applies to the next `play()` (start a song with its drums muted) instead of being reset to full. `sfx({ after })` counts steps at 120 bpm once the song has stopped, as documented, instead of at the stopped song's tempo.
