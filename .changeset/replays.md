---
"@debuffjp/dev": minor
"@debuffjp/mcp": minor
"create-debuff": patch
---

New: deterministic replays. With `devTools({ input })`, the dev tools record every key, pointer and param change from page load. The overlay's log tab has "save replay" and "copy replay", `window.__DEBUFF_DEV__.replay(toTick?)` returns one, and the MCP server's `game_replay` tool saves one to `.debuff/replays/`. A replay is a scenario, so `debuff scenario <file>` plays the session back exactly. Pass a note's tick to reproduce what the human saw when they flagged it. Anything a replay can't reproduce, such as slow motion, is listed in `warnings`.
