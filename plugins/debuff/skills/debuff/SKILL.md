---
name: debuff
description: Use when working on a game built with debuff (a package.json depending on @debuffjp/core, or a debuff.config file). Covers how to see, play, tune and verify the game through the debuff MCP tools instead of guessing from code.
---

# Working on a debuff game

The debuff MCP server runs in the project you opened. Use it to look at the game before changing code.

1. Start with `inspect_project` to learn the scenes, params, assets and scripts.
2. To see the game, call `game_start`. If the human has `npx debuff dev` running with the game open, you attach to their tab (mode `live`): read `game_notes` first, because those are moments they flagged. Otherwise you get a private paused copy (mode `headless`) where time moves only through `game_step` (60 steps = 1 second).
3. Look with `game_state` and `game_capture`. Drive it with `game_input` and `game_step`. Call `game_pause` before you inspect a live game.
4. Check `game_errors` after every change. Each error says whose problem it is. If the kind is `debuff-bug`, tell the human and share its `reportUrl`. Don't work around it.
5. For feel changes, prefer params (`game_params`, `game_set_param`) over code. Verify behaviour with `run_tests`: logic tests in `tests/*.test.ts` ([keiko](https://github.com/debuffjp/debuff/tree/main/tooling/keiko)) play the real game in Node in milliseconds, so write one for each mechanic or fix. Use `run_scenarios` when the change is visual, and check that `build` reports no leaks.

The server also has ready-made workflows as prompts: playtest, fix-errors, tune-feel, add-mechanic and explain-stutter.

Creative direction belongs to the human. For art, feel, difficulty and names, propose options and let them choose. Don't update screenshot baselines without their approval.
