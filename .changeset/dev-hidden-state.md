---
"@debuffjp/dev": minor
---

`state()` has `hidden`: true while the tab is in the background, where the browser stops animation frames and `tick` stands still although nothing paused the game. `step(n)` still advances it.
