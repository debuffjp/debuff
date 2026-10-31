---
"plonkjs": minor
---

`play()` checks the whole song before it starts and throws there, leaving the current song playing. The error names the step, its pattern, the section and the track, and a modifier with no note in front of it (a lone `?50`) says so. Before, the error came from the scheduler on every tick and named only the token.
