---
"@debuffjp/dev": minor
"@debuffjp/cli": minor
"keiko": minor
---

The dev hooks' `pointerDown(x, y, kind?)` and `tap(x, y, kind?)` take what is pressing: `"mouse"` (the default, as before), `"touch"` or `"pen"`. The game sees it in `pointer.kind`. A touch or pen press is contact 1 in `pointer.touches` and the primary pointer, and a mouse press is only the primary pointer, so a dev drag no longer looks like both a mouse and a touch. Scenarios take `{ "pointerDown": [x, y, "touch"] }` and `{ "tap": [x, y, "pen"] }`, and keiko's `game.pointerDown(x, y, "touch")` does the same, through the dev hooks or as real touch events.
