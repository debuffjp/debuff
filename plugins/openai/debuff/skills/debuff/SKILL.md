---
name: debuff
description: Use when the user wants to make a 2D game that runs in the browser (a platformer, top-down adventure, arcade game, pixel-art game, game jam entry or quick prototype), or is working on a project that depends on @debuffjp/core. Starts a playable game in about a minute with debuff, then builds it with logic tests, scenario captures and fuzzing that prove each change works.
---

# Making 2D browser games with debuff

debuff is an open-source TypeScript toolkit for 2D browser games. It handles the game loop, input (keyboard, touch, gamepad), crisp pixel rendering, sound, Tiled and LDtk levels, testing and the web build. Its CLI gives you evidence about the game, so check your work against tests and captures instead of guessing from code.

## Starting a new game

Ask the human what they want to make if it isn't clear, then pick the closest starter:

- `platformer`: runs and jumps through a Tiled level, with collision, coins and tunable movement
- `mossfell`: top-down action-adventure with screen-by-screen rooms, sword combat, hearts, enemies and a locked door
- `squish`: squishy match-3 for touch and mouse, with swaps, cascades, combos and squash-and-stretch juice, drawn in code
- `basic`: one scene and a moving character, the smallest start

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

Creative direction belongs to the human. For art, feel, difficulty and names, propose two or three options and let them choose. Don't run `npx debuff scenario --update` to accept new screenshots without their approval.

Docs: https://debuff.jp · API: https://debuff.jp/api/ · Community: https://discord.gg/jshbDHSpCY
