---
"@debuffjp/core": minor
"@debuffjp/dev": minor
"@debuffjp/mcp": minor
"keiko": minor
---

Agent tooling from building gloop:

- MCP: new `game_command` tool runs a game's dev command by name with JSON args. `game_start` takes `viewport: [w, h]` (headless) and `reducedMotion` to force it on or off. `game_frames` takes `summary` (percentiles and the 3 slowest frames), `game_step` takes `quiet` (no inspect state), and `game_capture` takes `path` to save the PNG in the project. `game_profile` in headless mode now says profiling needs live mode instead of blaming requestAnimationFrame.
- dev: `state()` reports `reducedMotion` and `reducedMotionForced`; new `reducedMotion(value | null)` hook forces it.
- core: `Random#state` gets and sets the generator's state, for undo and replays.
- keiko: `toBeLessThan` / `toBeGreaterThan` matchers; docs say `-t` is a case-insensitive substring match and point async game logic at `run()` / `settle()` instead of `wait()`.
