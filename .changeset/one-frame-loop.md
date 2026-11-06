---
"@debuffjp/core": patch
---

`game.stop()` then `game.start()` from inside a frame (a restart in `update`, a hook or a `sceneChange` listener) no longer starts a second frame loop. Before, both loops rendered every vsync until the next `stop()`, so render cost doubled and the fps readout showed about twice the real rate.
