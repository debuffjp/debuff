---
name: debuff-setup
description: Set up debuff, the open-source TypeScript framework for 2D browser games, with any coding agent (Claude Code, Codex, Cursor, Gemini CLI, VS Code Copilot, Windsurf). Use when asked to set up debuff, start a new debuff game, connect the debuff MCP server, or when a debuff or npx debuff command fails. Gets a machine from nothing to a playable game the agent can run, see and test.
---

# Setting up debuff

This skill gets a machine working: Node, a project, and the debuff MCP server connected to your agent. Once a project exists, read its `AGENTS.md` for how to work on the game.

## The whole setup

```bash
node --version                                              # needs 22 or newer
npm create debuff@latest my-game -- --template basic --yes  # scaffold
cd my-game && npm install
npx debuff doctor --fix                                     # checks everything, applies the safe fixes
npm run dev                                                 # the game at the URL it prints (5173, or the next free port)
```

Then connect the MCP server (next section) so you can play and inspect the game instead of guessing from code.

If Node is missing or older than 22, ask the human to install it from https://nodejs.org. Don't install Node or a package manager yourself.

## Pick a template

Ask what they want to make if it isn't clear. Starting points:

- `basic`: one scene and a moving character
- `topdown`: a tile world seen from above, 8-way movement, walls, a following camera
- `isometric`: a 2:1 isometric grid with depth sorting
- `sidescroller`: run and jump, coyote time, one-way platforms
- `pointclick`: rooms, hotspots, an inventory and speech bubbles

Finished small games to learn from: `platformer`, `mossfell` (top-down action-adventure), `squish` (match-3).

## Connect the MCP server

There are two debuff MCP servers. This one, the project server, is the one you need: it runs, plays and inspects your game. The hosted docs server (`https://debuff.jp/mcp`, below) only answers questions about debuff and is optional once a project exists.

The project server is `npx -y @debuffjp/mcp`, run from the project folder. Every template ships `.mcp.json` for Claude Code. For other agents:

| Agent | How |
| --- | --- |
| Claude Code | Open the project folder and approve the server from `.mcp.json`, or `claude mcp add debuff -- npx -y @debuffjp/mcp` |
| Codex CLI | `codex mcp add debuff -- npx -y @debuffjp/mcp` |
| Gemini CLI | `gemini mcp add debuff npx -y @debuffjp/mcp` |
| Cursor | `.cursor/mcp.json`: `{ "mcpServers": { "debuff": { "command": "npx", "args": ["-y", "@debuffjp/mcp"] } } }` |
| VS Code (Copilot) | `.vscode/mcp.json`: `{ "servers": { "debuff": { "type": "stdio", "command": "npx", "args": ["-y", "@debuffjp/mcp"] } } }` (the key is `servers`, not `mcpServers`) |
| Windsurf | Add a server in its MCP settings with command `npx` and args `-y @debuffjp/mcp` |

On Windows, if the agent can't start `npx`, use command `cmd` with args `/c npx -y @debuffjp/mcp`.

The human may need to restart the agent or reload the window afterwards. Check it worked: call the `doctor` tool, then `inspect_project`.

Claude Code and Codex users can install the full plugin instead, which adds the server and the working skills: https://debuff.jp/docs/agents

## When something fails

Run `npx debuff doctor` first (or the MCP `doctor` tool) and do what it says, before trying fixes of your own. It checks Node, the debuff package versions, `node_modules`, `debuff.config.ts`, assets, saves, agent files and the browser, and prints the fix for each problem. `--fix` applies the safe ones (install, dedupe, a missing `.mcp.json`). `--live` also boots the game under the dev server and checks it exposes its dev hooks. `--json` is for tools.

Read the exit code of every debuff command before its output:

| Exit | Meaning | What to do |
| --- | --- | --- |
| 0 | Success | Carry on |
| 1 | A test, scenario or fuzz run failed, or something unexpected broke | Read the report |
| 2 | Setup needs fixing (browser, config, dev hooks, a busy port) | Run `npx debuff doctor` and apply its fixes; don't retry |
| 3 | Unknown command or option, or a missing folder | Fix the command line |

With `--json`, stdout is one JSON document; a failure is `{ "error": { "code", "message", "fix", "transient" } }`. Retry only when `transient` is true.

To move a project to the latest debuff, run `npx debuff upgrade` (`--dry-run` first to see the plan); ask the human before upgrading. It updates every debuff package together, installs, and rewrites the project's agent skills.

Common causes:

- **Versions differ:** every `@debuffjp/*` package must be on the same version. Set them all to the CLI's version, then `npm install`.
- **No browser:** scenarios, fuzzing and the MCP server need Chrome or Edge. Install one, or set `DEBUFF_BROWSER` to a Chromium-based browser.
- **`NODE_ENV` set in the shell:** unset it; debuff picks the mode per command.

## Questions without a project

The hosted docs server answers questions about debuff's API and guides with nothing installed: add `https://debuff.jp/mcp` as a remote (streamable HTTP) MCP server. Docs: https://debuff.jp. Every page is also Markdown: add `.md` to its URL.

Creative direction belongs to the human: propose options for art, feel and names, and let them choose.
