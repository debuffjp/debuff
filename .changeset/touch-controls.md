---
"@debuffjp/input": minor
---

`TouchControls` puts a stick and buttons on screen for phones and tablets, feeding the same actions as keys and pads: bind `TouchStickLeft`, `TouchStickRight`, `TouchStickUp`, `TouchStickDown` and `Touch<name>` (`TouchA`) next to `ArrowLeft` and `PadA`. The stick is fixed or floating (centred where the thumb lands in a zone), analog through `touch.stick.x` and `y`, with a deadzone for the directions. Each contact keeps the control it started on until it lifts, a tap between two steps still counts, and positions can count from the right and bottom edges. They show from the first touch, `draw()` gives plain circles, and the state is there to draw your own. Tests drive them with `pointer.touchStart` / `touchMove` / `touchEnd`.

`Input` has a `virtual` map for sources that code sets each step, which `TouchControls` uses.
