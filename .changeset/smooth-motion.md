---
"@debuffjp/core": minor
---

`smoothMotion(game, () => [player, enemies, shots])` draws moving objects between fixed steps: `smooth.x(o)` and `smooth.y(o)` give the position blended by the render alpha, `smooth.snap(o)` after a teleport. It saves positions before every step, so objects need no registering or clean-up, and it only reads them, so replays and tests are unaffected. It replaces the `prevX`/`prevY` bookkeeping and lerp that games wrote themselves.

While the game is frozen (`game.freeze()`), `render` and the render hooks now get `alpha` 1 and the camera draws where it is. They used to get the leftover time, so on displays faster than 60 Hz the camera, and anything a game blended by `alpha`, jumped back and forth on every frame of a hitstop.
