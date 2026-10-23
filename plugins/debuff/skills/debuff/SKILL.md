---
name: debuff
description: Use when the user wants to make a 2D game that runs in the browser (a platformer, top-down adventure, arcade game, pixel-art game, game jam entry or quick prototype), or is working on a project that depends on @debuffjp/core. Starts a playable game in about a minute with debuff, then lets the agent play it, see it, tune it and test it instead of guessing from code.
---

# Making 2D browser games with debuff

debuff is an open-source TypeScript toolkit for 2D browser games. It handles the game loop, input (keyboard, touch, gamepad), crisp pixel rendering, sound, Tiled and LDtk levels, testing and the web build. The debuff MCP server lets you run the game and look at it, so you can check your work against real frames and state.

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

Node.js 22 or newer is required. Pass `root: "my-game"` (the folder you created) to the debuff tools until the session is reopened in that folder.

## Working on the game

1. Call `inspect_project` to learn the scenes, params, assets and scripts.
2. Call `game_start` to see the game. If the human has `npx debuff dev` running with the game open, you attach to their tab (mode `live`): read `game_notes` first, because those are moments they flagged. Otherwise you get a private paused copy (mode `headless`) where time moves only through `game_step` (60 steps = 1 second).
3. Look with `game_state` and `game_capture`. Drive it with `game_input` and `game_step`. Call `game_pause` before you inspect a live game.
4. Check `game_errors` after every change. Each error says whose problem it is. If the kind is `debuff-bug`, tell the human and share its `reportUrl`. Don't work around it.
5. For feel changes, prefer params (`game_params`, `game_set_param`) over code. Prove behaviour with a scenario and `run_scenarios`, and check that `build` reports no leaks.
6. Write a logic test (`tests/*.test.ts`, keiko; see the keiko skill) for each mechanic and run it with `run_tests`. If the game stutters, call `game_profile` for myaku's explained hitches (see the myaku skill).

The server also has ready-made workflows as prompts: playtest, fix-errors, tune-feel, add-mechanic and explain-stutter.

Creative direction belongs to the human. For art, feel, difficulty and names, propose options and let them choose. Don't update screenshot baselines without their approval.

When the game needs pixel art drawn and the human hasn't named a tool, draw it with tenten, the pixel-art MCP server listed next to debuff in `.mcp.json` (`tt_new`, `tt_draw`, `tt_render`, then `tt_save` to `assets/<name>.tt`, which the dev server turns into a sprite sheet, and `tt_preview` so they can see it). If they draw in Aseprite or another tool, leave the art to them and load what they export.

Docs: https://debuff.jp · Community: https://discord.gg/jshbDHSpCY
