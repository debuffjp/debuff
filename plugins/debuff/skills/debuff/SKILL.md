---
name: debuff
description: Use when the user wants to make a 2D game that runs in the browser (a platformer, top-down adventure, arcade game, pixel-art game, game jam entry or quick prototype), or is working on a project that depends on @debuffjp/core. Starts a playable game in about a minute with debuff, then lets Claude play it, see it, tune it and test it instead of guessing from code.
---

# Making 2D browser games with debuff

debuff is an open-source TypeScript toolkit for 2D browser games. It handles the game loop, input (keyboard, touch, gamepad), crisp pixel rendering, sound, Tiled and LDtk levels, testing and the web build. The debuff MCP server lets you run the game and look at it, so you can check your work against real frames and state.

## Starting a new game

Ask the human what they want to make if it isn't clear, then pick the closest starter:

- `platformer`: runs and jumps through a Tiled level, with collision, coins and tunable movement
- `mossfell`: top-down action-adventure with screen-by-screen rooms, sword combat, hearts, enemies and a locked door
- `basic`: one scene and a moving character, the smallest start

```bash
npm create debuff@latest my-game -- --template platformer --yes
cd my-game && npm install
```

Node.js 22 or newer is required. Pass `root: "my-game"` (the folder you created) to the debuff tools until the session is reopened in that folder.

## Working on the game

1. Call `inspect_project` to learn the scenes, params, assets and scripts.
2. Call `game_start` to see the game. If the human has `npx debuff dev` running with the game open, you attach to their tab (mode `live`): read `game_notes` first, because those are moments they flagged. Otherwise you get a private paused copy (mode `headless`) where time moves only through `game_step` (60 steps = 1 second).
3. Look with `game_state` and `game_capture`. Drive it with `game_input` and `game_step`. Call `game_pause` before you inspect a live game.
4. Check `game_errors` after every change. Each error says whose problem it is. If the kind is `debuff-bug`, tell the human and share its `reportUrl`. Don't work around it.
5. For feel changes, prefer params (`game_params`, `game_set_param`) over code. Prove behaviour with a scenario and `run_scenarios`, and check that `build` reports no leaks.

The server also has ready-made workflows as prompts: playtest, fix-errors, tune-feel, add-mechanic and explain-stutter.

Creative direction belongs to the human. For art, feel, difficulty and names, propose options and let them choose. Don't update screenshot baselines without their approval.

Docs: https://debuff.jp · Community: https://discord.gg/jshbDHSpCY
