---
"@debuffjp/mcp": patch
---

Game sessions start and stop one at a time. Two overlapping `game_start` calls used to leave the first headless browser and dev server running with nothing to stop them, and a `game_stop` sent while a start was still in progress was undone when the start finished. A failed start no longer changes the folder captures are written to, a headless session closes its dev server even when the browser won't close, and `game_replay` saves under the running game's project like `game_capture` does.
