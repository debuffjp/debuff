---
"@debuffjp/core": patch
"@debuffjp/dev": patch
---

The dev overlay's pause state follows the game loop. When game code calls `game.stop()`, the overlay shows the game as paused by "game" and its play button starts it again; before, it still showed "pause" and play did nothing. When game code calls `game.start()` while the dev tools had paused it, the overlay shows it running and pause works straight away. `game.isStarted` is new: true from `start()` until `stop()`, including while the loop is halted for a hidden tab.
