# Claude directory submission (draft)

Paste into claude.ai/directory/manage. Route: **plugin bundle**.

- **Name:** debuff
- **Repository:** https://github.com/debuffjp/debuff (marketplace at `.claude-plugin/marketplace.json`, plugin at `plugins/debuff`)
- **Category:** Development
- **Short description:** Inspect, build, test and play a 2D web game made with debuff.
- **Long description:** Gives Claude the evidence a human playtester has. It can read the project, start the game headless or attach to the tab you have open under `debuff dev`, send input, step time, take captures, tune params live, run scenarios and read runtime errors that say whose problem they are. A skill teaches the workflow, and five prompts cover common jobs: playtest, fix-errors, tune-feel, add-mechanic and explain-stutter. Claude proposes options and leaves the creative calls to you.
- **Requirements:** Node 22+. Runs locally with `npx @debuffjp/mcp` in the game's folder. Needs no account and no network access beyond npm.
- **Privacy:** Everything runs on the user's machine. Nothing is sent anywhere.
- **Support:** https://github.com/debuffjp/debuff/issues

## Test instructions for reviewers

1. `npm create debuff@latest my-game`, pick the basic template, then `cd my-game && npm install`.
2. Install the plugin, open Claude Code in `my-game`, and decline the project's own `debuff` server when asked.
3. Ask: "playtest this game". Claude should call `inspect_project`, `game_start` (headless), `game_state`, `game_input`, `game_step` and `game_capture`, then report findings.
4. Optional live mode: run `npx debuff dev`, open the URL, then ask again. `game_start` reports `mode: live`.

All tools are annotated read-only or non-destructive. None of them delete anything.
