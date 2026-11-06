---
"@debuffjp/dev": minor
"@debuffjp/cli": minor
"@debuffjp/mcp": patch
"keiko": patch
---

Replays say where they stop matching the session they recorded.

- Dev tools: a recording keeps a checkpoint every 60 ticks, a short hash of each part of the game's state (`scene`, `events`, `state.<key>` for each top-level key of `inspect()`, `plugins.<name>`). `replay()` writes them as `{ "checkpoint": { ... } }` steps. Rewinding checks them on the way and, if the state stops matching, adds a warning and an activity log entry naming the tick and the parts. A code reload doesn't check them, since new code is meant to play differently. New dev hook: `checkpoint()`.
- `debuff scenario`: the first checkpoint that differs adds one warning, for example `the game's state stopped matching the recording at tick 180: state.player differs (it matched at tick 120)`, with the likely causes. The scenario still passes. Before 0.31, a replay that drifted played on silently.
- MCP: `game_replay` says the saved file has checkpoints that `run_scenarios` checks.
- keiko: `game.replay()` skips `checkpoint` steps instead of failing with "unknown step".
