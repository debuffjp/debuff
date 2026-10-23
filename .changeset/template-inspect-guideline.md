---
"create-debuff": patch
---

The templates' agent guide says what `inspect()` is for: it is all that tests, scenarios, fuzzing, replay diffs and agents can see of the game, so report what a player reacts to as lists of positions, not counts, cap large lists, and name the camera or board transform plainly. It also points games whose logic awaits something at `await game.run()` instead of `wait()`.
