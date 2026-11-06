---
"@debuffjp/core": patch
"@debuffjp/input": patch
---

The key or tap that skips the start-up splash no longer also counts as a press in the first game step, so it can't skip a title screen too. `game.hooks.splashEnd(fn)` is new: it fires once when the splash ends, and `Input` clears its press and release edges there while keeping held keys held.
