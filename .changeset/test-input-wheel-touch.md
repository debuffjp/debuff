---
"keiko": minor
"@debuffjp/dev": minor
"@debuffjp/cli": minor
---

Tests and scenarios can press the right mouse button, scroll the wheel and touch with several fingers, all through the same paths as real input.

- keiko: `game.press("PointerRight")` (and `"PointerMiddle"`), `game.wheel(dy, dx?)`, and `game.touchDown(id, x, y)`, `touchMove(id, x, y)` and `touchUp(id)`. debuff games are driven through their dev hooks. Other games get real DOM events: mouse button presses (a button pressed while another is held arrives as a `pointermove`, as in browsers, and the right button fires `contextmenu`), `wheel` events, and `pointerType: "touch"` pointer events with touch events. `game.replay()` plays the new scenario steps.
- Dev hooks: `wheel(dy, dx?)`, `touchDown(id, x, y, kind?)`, `touchMove(id, x, y)` and `touchUp(id)`. Recorded replays keep wheel scrolls and touches, so a session played on a phone replays exactly. They need `@debuffjp/input` 0.16 and say so on older versions.
- Scenarios: `{ "wheel": dy }` or `{ "wheel": [dy, dx] }`, `{ "touchDown": [id, x, y] }` (`[id, x, y, "pen"]` for a pen), `{ "touchMove": [id, x, y] }` and `{ "touchUp": id }`.
