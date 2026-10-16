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
| `game_start` | Attach to the live game, or open a private headless copy, paused (see below) |
| `game_step` | Advance fixed simulation steps (pausing first); returns state |
| `game_pause` | Pause or resume a live game |
| `game_frames` | Recent frame breakdown: update/render ms, catch-up steps, quads, draw calls, long tasks |
| `game_notes` | Moments the human flagged in the overlay, with the state at that tick |
| `game_input` | `press` / `release` keys; `tap`, `pointer_down`, `pointer_move`, `pointer_up` |
| `game_state` | Scene, tick, renderer, frame stats, your `inspect()` data |
| `game_params` / `game_set_param` | Read and tune typed params (validated) |
| `game_capture` | The current frame as a PNG image |
| `game_errors` | Uncaught runtime errors |
| `game_stop` | Close the game |

## Live and headless

If you have the game open under `debuff dev`, `game_start` attaches to **that tab** (mode `live`). The overlay shows an **agent** badge, and every pause, step and param change the agent makes appears in its activity log, where you can undo it. Type a note in the overlay ("jump feels floaty here") to flag a moment; the agent reads it, along with the game state at that tick, through `game_notes`. `game_stop` resumes your game and disconnects.

Otherwise, or with `mode: "headless"`, the agent gets a private copy in a headless browser. Time only advances through `game_step`, so what it sees is reproducible, and a scenario can replay it exactly.
