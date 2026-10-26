---
"@debuffjp/cli": patch
"keiko": patch
---

Scenario fixes in `debuff scenario` and keiko's `game.replay()`:

- `{ "tap": "KeyT" }` taps the key for one step, as keiko's `game.tap("KeyT")` does. Before, `debuff scenario` silently spread the string into `tap(x, y)`, and keiko pressed the wrong key. The schema accepts a key code. A `tap` that is neither a code nor a point fails with an explanation.
- `{ "expect": { "state.x": 0 } }` (and the same in `until`) fails with `state.x: expected a comparison object like { "eq": 0 }, got 0`, instead of a TypeError or a silent pass. An object with none of `eq`, `gt`, `gte`, `lt`, `lte` and `approx` is reported the same way.
