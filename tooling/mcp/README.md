# @debuff/mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI agents inspect, build, test and **play** a debuff game. It uses the same evidence a human would want: real state, real frames, real test results.

## Setup

New projects from `npm create debuff` include a `.mcp.json`, so MCP clients that read it (such as Claude Code) pick the server up automatically. For other clients:

```bash
claude mcp add debuff -- npx -y @debuff/mcp        # Claude Code
```

```json
{
  "mcpServers": {
    "debuff": { "command": "npx", "args": ["-y", "@debuff/mcp"] }
  }
}
```

Run it from the game's folder, or pass `--root <dir>` (or set `DEBUFF_ROOT`).

## Tools

| Tool | What it does |
| --- | --- |
| `inspect_project` | Dependencies, plugins and their contributions, assets, last build size |
| `list_assets` | Every asset with its type, size and importer, plus warnings and possibly unused ids |
| `build` | Production build plus size report; `leaks` must be empty |
| `run_scenarios` | Run `scenarios/*.json` headless; per-step results, errors, captures |
| `game_start` | Start the dev server and open the game, paused |
| `game_step` | Advance fixed simulation steps; returns state |
| `game_input` | `press` / `release` keys; `tap`, `pointer_down`, `pointer_move`, `pointer_up` |
| `game_state` | Scene, tick, renderer, frame stats, your `inspect()` data |
| `game_params` / `game_set_param` | Read and tune typed params (validated) |
| `game_capture` | The current frame as a PNG image |
| `game_errors` | Uncaught runtime errors |
| `game_stop` | Close the game |

Time only advances through `game_step`, so what an agent sees is reproducible, and a scenario can replay it exactly.
