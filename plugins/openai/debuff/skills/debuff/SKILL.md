---
name: debuff
description: Use for any work on a 2D browser game made with debuff (package.json depends on @debuffjp/core, or AGENTS.md says debuff): fixing a bug, making the player jump higher, run faster or feel better, adding a mechanic, making it look nicer, changing levels or UI, chasing a stutter, checking a change works, or when `npm test`, a build or a debuff command fails. Also use when the user wants to make a new 2D game that runs in the browser (a platformer, top-down adventure, arcade game, pixel-art game, game jam entry or quick prototype). Proves each change with logic tests, scenario captures and fuzzing instead of guessing from code.
---

# Making 2D browser games with debuff

debuff is an open-source TypeScript framework for 2D browser games. It handles the game loop, input (keyboard, touch, gamepad), crisp pixel rendering, sound, Tiled and LDtk levels, testing and the web build. Its CLI gives you evidence about the game, so check your work against tests and captures instead of guessing from code.

## Before you change how it looks or feels

Art, colours, effects, UI style, feel, difficulty and names are the human's call.

- **Feel with a clear direction** ("jump higher", "run faster", "less floaty"): make the change, through params. Measure a few values with a logic test (`game.set("player.jumpSpeed", 340)`, then `game.trace`), then set the param's default in `game.params.define(...)`. Reply with the before and after numbers (jump height in pixels, top speed, time to apex) and two alternatives, one smaller and one bigger, so the human can pick a different one.
- **Open-ended looks or feel** ("make it nicer", "make it feel better", a new art style): don't edit yet. Reply with two or three options and what each one changes, and wait for the human to pick. Make the change they choose.

## Starting a new game

Ask the human what they want to make if it isn't clear, then pick the closest starter. Base templates are starting points for a new game:

- `basic`: one scene and a moving character, the smallest start
- `topdown`: a tile world seen from above, with tenten sprites and tileset, 8-way movement, wall collision, a following camera and pickups
- `isometric`: a 2:1 isometric grid, with tenten floor and cube tiles, depth sorting, grid-to-screen projection and pickups
- `sidescroller`: run and jump through a side-scrolling level, with coyote time, jump buffering, one-way planks and a following camera
- `pointclick`: click to walk, look and use, with rooms, exits, hotspots, an inventory and speech bubbles

Examples are finished small games, for learning from or building on:

- `platformer`: runs and jumps through a Tiled level, with collision, coins and tunable movement
- `mossfell`: top-down action-adventure with screen-by-screen rooms, sword combat, hearts, enemies and a locked door
- `squish`: match-3 for touch and mouse, with swaps, cascades, combos and squash-and-stretch juice, drawn in code

```bash
npm create debuff@latest my-game -- --template platformer --yes
cd my-game && npm install
```

Node.js 22 or newer is required. The new project has an `AGENTS.md` with its commands and conventions: read it before changing code.

## Working on the game

1. Run `npx debuff inspect` to learn the packages, scenes, assets and last build size.
2. Read `src/main.ts`. Scenes have `update`, `render` and `inspect()`; feel values live in `game.params.define(...)`.
3. Make the smallest change that works. Put tunable numbers in params, use debuff's `draw`, `input`, `assets` and `juice` APIs, and keep dev-only code inside `if (import.meta.env.DEV)`.
4. Prove it. Add a logic test in `tests/` that boots the real game, drives input and time, and asserts on `inspect()` state, then run `npx debuff test` (milliseconds, no browser). For visual changes, add a scenario in `scenarios/` and run `npx debuff scenario`.
5. Before calling a feature done, run `npx debuff fuzz`. It plays the game with random input and saves each crash, stuck state or loop as a replayable scenario in `.debuff/fuzz/`. Turn a finding into a test with `game.replay(".debuff/fuzz/<file>")`, watch it fail, fix it, and keep the test.
6. Run `npm run build`. It fails if dev-only code leaks into the build.
7. Tell the human to run `npm run dev` and press <kbd>`</kbd> for the dev panel, where they can tune params live.

Errors come back explained: `kind` says whose bug it is (`your-code`, `debuff-usage`, `debuff-bug`, `outside`) and `where` gives the source line. For `debuff-bug`, tell the human and share its `reportUrl` instead of working around debuff.

Asset ids are typed from `.debuff/assets.d.ts`, which the dev server and `npx debuff assets` regenerate. When `tsc` rejects an asset id, check the spelling against that file instead of casting it away; add the file under `assets/` if the asset is missing.

When a debuff tool costs you real time (slow, flaky, a missing API, docs that misled you), offer to report it once you're unstuck. With the human's OK, run `npx debuff papercut "<symptom>" --minutes <n> --workaround "<what worked>"` (from 0.24). It goes to the public board at papercuts.debuff.jp, so send only the symptom, the minutes and the workaround, never code or project details. If it lists similar papercuts, rerun with `--hit <id>` for the matching one.

Creative direction belongs to the human. For art, feel, difficulty and names, propose two or three options and let them choose. Don't run `npx debuff scenario --update` to accept new screenshots without their approval.

For anything that affects play, use `game.random` and `game.clock`, not `Math.random`, `Date.now` or `setTimeout`. Browser replays, scenarios and fuzz findings only reproduce what the game's seed and fixed step drive. In a project with the debuff hook (`.claude/hooks/debuff.mjs`, from 0.23), a refused edit or command says why and what to do instead: follow it rather than finding another way round.

Docs: https://debuff.jp · API: https://debuff.jp/api/ · Community: https://discord.gg/jshbDHSpCY
