---
"@debuffjp/input": minor
---

`input.pointer.wheel` and `input.pointer.wheelX`: the wheel or trackpad scroll over the canvas this step, in CSS pixels (line and page deltas are converted), reset after every step. `pointer.scroll(dy, dx)` simulates it. `new Input(game, { captureWheel: true })` stops the page scrolling while the wheel is over the game, for wheel zoom in embeds; by default the page still scrolls as before.
