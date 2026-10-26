---
"@debuffjp/input": minor
---

`input.pointer.kind` says what made the latest press: `"mouse"`, `"touch"` or `"pen"`, so games don't need their own `pointerdown` listener to read `pointerType`. Contacts in `pointer.touches` carry a `kind` too, and `pointer.touchesStarted` / `pointer.touchesEnded` list the contacts that started and ended this step, so games don't diff the map themselves. `pointer.touchStart(id, x, y, kind?)`, `touchMove` and `touchEnd` simulate contacts through the same path as real ones: the first contact also presses the primary pointer. `pointer.press(x, y, kind?)` takes an optional kind (default `"mouse"`).
