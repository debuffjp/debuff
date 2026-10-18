---
"@debuffjp/core": minor
"@debuffjp/dev": minor
"@debuffjp/cli": minor
"keiko": minor
"create-debuff": patch
---

New: assertions on what happens in the game, not on pixels.

- `game.emit("coin", detail?)` marks a game event. The dev tools count events by name in `state().events`, and `__DEBUFF_DEV__.events()` lists the latest with their tick and detail.
- Scenarios have an `until` step: `{ "until": { "events.coin": { "gte": 1 } }, "within": 60 }` steps one tick at a time until the conditions hold, and fails with the actual values if they don't. Use it instead of guessing a `wait`. `expect` and `until` read `events.<name>` as 0 until the first emit.
- keiko replays `until` steps and adds `game.emitted("coin")`.
- New projects' `AGENTS.md` tells agents to prefer state and event assertions over screenshots, and the platformer emits `coin` and `win`, with a `collect-coin` scenario that uses them.
