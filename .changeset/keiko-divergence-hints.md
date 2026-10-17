---
"keiko": patch
---

When `test.deterministic` finds the runs diverging, the error says whether the game was loading in the steps before (a load racing the frames, not game logic) and points to `eventually()`. `onStep` hooks receive whether a load was in flight.
