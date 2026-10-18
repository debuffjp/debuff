# Agent guide

This is a 2D browser game made with **debuff** (https://debuff.jp). These notes are for AI coding agents working on it. The human you're working with makes the creative calls; you do the implementation, testing and chores.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload. Press <kbd>`</kbd> in the game for the dev panel |
| `npx debuff test` | Runs the logic tests in `tests/`: the real game in Node, no browser, in milliseconds. Run it after every change. `-t <text>` runs matching tests; `--json` for tools |
| `npm test` | Logic tests, then `scenarios/*.json` in a headless browser with screenshot comparison |
| `npx debuff fuzz` | Plays the game with random input for a few minutes. Each crash, stuck state or back-and-forth loop is saved as a scenario in `.debuff/fuzz/` that replays it exactly |
| `npm run build` | Type-checks, builds to `dist/` and prints a size report. Fails if dev-only code leaks |
| `npm run assets` | Regenerates the asset manifest and lists unused assets |
| `npx debuff inspect` | Project summary as JSON: packages, plugins, assets, last build size |
| `npx debuff scenario --update` | Accept new screenshot baselines. **Only after the human has approved the visual change** |

## Layout

- `src/main.ts`: the game, which creates `new Game(...)`, scenes (`update`, `render`, `inspect`) and params.
- `assets/`: source art, audio and data. The manifest and atlases are generated from it, and only files the game references ship. Don't edit generated files.
- `tests/`: logic tests (`*.test.ts`, `keiko`). They boot the real game headless, drive input, time and params, and assert on `inspect()` state. Add one for each mechanic you build. Guide: https://debuff.jp/docs/testing
- `scenarios/`: JSON scripts with screenshot captures, run in a real browser. Add one when a change is visual.
- `.mcp.json`: connects the debuff MCP server, so you can play and inspect the running game.

## Work loop

1. **Look before you change.** With the MCP server, call `game_start`. If the human has the game open under `npm run dev`, you attach to it live, so read `game_notes` first: they're moments the human flagged, and `game_replay` with a note's tick saves a scenario that reproduces it. Then use `game_state`, `game_capture` and `game_errors`.
2. **Tune before you rewrite.** Feel values (speed, gravity, timings) live in `game.params.define(...)`. Change them with `game_set_param` and show the human before editing code. The human can undo your changes in the dev panel.
3. **Make the smallest change that works.** Keep dev-only code inside `if (import.meta.env.DEV)`.
4. **Verify.** Run `npm test` and `npm run build`, and check `game_errors` is empty. Before calling a feature done, run `npx debuff fuzz`: to fix a finding, turn its file into a logic test with `game.replay(".debuff/fuzz/<file>")`, watch it fail, fix, and keep the test. Errors come back explained: `kind` says whose bug it is (`your-code`, `debuff-usage`, `debuff-bug`, `outside`) and `where` gives the source line.
5. **Report** what changed, what you verified, and anything you couldn't check.

## Rules

- **Creative direction belongs to the human:** art, feel, difficulty, story and names. Propose two or three options; don't decide.
- Don't update screenshot baselines (`--update`) without the human's say-so.
- If `game_errors` reports `debuff-bug`, it's a bug in debuff, not this game. Tell the human and share its `reportUrl`; don't work around debuff internals.
- Prefer debuff's APIs (`draw`, `input`, `assets`, `params`, `juice`) over adding new runtime dependencies. The game should stay small.
- API reference: https://debuff.jp/api/ · Guides: https://debuff.jp/docs/getting-started

## Publishing

- Production builds open with a short "made with debuff" splash. **For Poki, turn it off** with `new Game({ splash: false })`: Poki doesn't allow splash screens. Game portals also forbid links out of the game and other sites' URLs, so don't add any. Guide: https://debuff.jp/docs/publishing
