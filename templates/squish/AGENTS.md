# Agent guide

This is **squish**, a squishy match-3 made with **debuff** (https://debuff.jp). These notes are for AI coding agents working on it. The human you're working with makes the creative calls; you do the implementation, testing and chores.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload. Press <kbd>`</kbd> in the game for the dev panel |
| `npx debuff test` | Runs the logic tests in `tests/`: the real game in Node, no browser, in milliseconds. Run it after every change. `-t <text>` runs matching tests; `--json` for tools |
| `npm test` | Logic tests, then `scenarios/*.json` in a headless browser with screenshot comparison |
| `npx debuff fuzz` | Plays the game with random input for a few minutes. Each crash or stuck state is saved as a scenario in `.debuff/fuzz/` that replays it exactly |
| `npm run build` | Type-checks, builds to `dist/` and prints a size report. Fails if dev-only code leaks, or if a change would break players' saves (`saves.json`) |
| `npx debuff build --accept-saves` | Accept a change to the game's saves. **Only after the human has approved it**: players with an old save lose what no longer fits, unless `new Storage(key, defaults, { version, migrate })` carries it over |
| `npm run assets` | Regenerates the asset manifest and lists unused assets |
| `npx debuff inspect` | Project summary as JSON: packages, plugins, assets, last build size |
| `npx debuff scenario --update` | Accept new screenshot baselines. **Only after the human has approved the visual change** |

## Layout

- `src/main.ts`: the game, which creates `new Game(...)`, scenes (`update`, `render`, `inspect`) and params.
- `assets/`: source art, audio and data. The manifest and atlases are generated from it, and only files the game references ship. Don't edit generated files.
- `tests/`: logic tests (`*.test.ts`, `keiko`). They boot the real game headless, drive input, time and params, and assert on `inspect()` state. Add one for each mechanic you build. If the game's logic awaits anything (an ad SDK, a save, a fetch), play it with `await game.run("1s")` rather than `wait("1s")`: `wait` is synchronous and promise callbacks only run between frames of `run()`. Guide: https://debuff.jp/docs/testing
- `inspect()` is all that tests, scenarios, fuzzing, replay diffs and agents can see of the game, so report what a player reacts to, not counts: enemies, bullets and pickups as lists of `{ x, y }` in game coordinates with a few fields such as `kind` and `hp`, the player with position and velocity, and a board as rows. Cap large lists (the nearest 50 is plenty). Name the camera or board transform for what it is (`camera`, `view`), not like an entity.
- `scenarios/`: JSON scripts run in a real browser. Prefer assertions on state over screenshots: `expect` and `until` read `state.*` (your `inspect()`) and `events.<name>`, the number of times the game called `game.emit("<name>")`. `{ "until": { "events.coin": { "gte": 1 } }, "within": 60 }` waits for a coin instead of guessing a wait. Add a capture only when a change is visual. When you add effects that flash or shake (hits, explosions, screen flashes), add a `{ "flashes": 240 }` step to check them for photosensitive safety, and a `{ "contrast": [x, y, w, h] }` step for new HUD text.
- `.mcp.json`: connects the debuff MCP server, so you can play and inspect the running game.

## How the game is put together

- `src/board.ts` holds the rules as plain functions over a grid of colour indexes: `findMatches`, `swapMatches`, `findMove`, `collapse` (gravity and refill) and `fill` (a fresh board with no matches and at least one move). No drawing or timing, so tests check rules directly. `toRows`/`fromRows` turn a board into letters (`a`-`f`, `.` for empty) and back.
- `src/main.ts` animates what the rules decide, one phase at a time: `idle` → `swap` → `pop` → `fall` → `pop` again while cascades continue → `idle`, or `unswap` when a swap matches nothing (no move spent). Phases advance on fixed timers, so runs replay exactly. Tweens only move and squash the pieces.
- Pieces are drawn in code (`drawPiece`): six flat colours, each with its own shape, so colour is never the only clue. Squash and stretch pivot from the bottom of each cell.
- Input: tap a piece then a neighbour, or swipe a piece; on keyboard or gamepad, move the cursor with arrows, pick up with Space/Z/A, then push with an arrow.
- Feel values are in two param groups: `feel` (swap, pop and fall timing, idle wobble) and `rules` (moves per round).
- `inspect()` reports `phase`, `score`, `moves`, `combo`, `selected`, `cursor`, `best` and `board` (rows of letters).
- Dev commands set up exact situations: `{ "command": "board", "args": [["abaacdef", …]] }` replaces the board, `{ "command": "moves", "args": [1] }` sets the moves left. Events: `swap`, `nomatch`, `pop` (`{ count, combo }`), `cascade`, `shuffle`, `over`.

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
