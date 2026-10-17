---
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
"@debuffjp/dev": minor
"create-debuff": minor
---

Logic tests with [keiko](https://github.com/debuffjp/debuff/tree/main/tooling/keiko), a new standalone package for testing any web game: it boots the real game in Node with no browser, on a virtual clock, so tests run in milliseconds and play out the same every time.

- **`debuff test`** runs `tests/**/*.test.ts` against your game through its dev tools. `-t <text>` filters by name; `--json` gives a report for tools.
- **MCP `run_tests`** lets agents run them after every change. Failures carry the tick, scene and state where they broke. The `add-mechanic`, `fix-errors` and `tune-feel` prompts now ask for a logic test.
- **Templates** include example tests (`tests/*.test.ts`), `keiko` as a dev dependency, and `npm test` runs logic tests before scenarios. `AGENTS.md` explains when to use which.
- **`@debuffjp/dev`**: `__DEBUFF_DEV__.state()` now reports `step`, the seconds per fixed simulation step.
