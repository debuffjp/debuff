# @debuffjp/mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI agents inspect, build, test and **play** a debuff game. It uses the same evidence a human would want: real state, real frames, real test results.

## Setup

New projects from `npm create debuff` include a `.mcp.json`, so MCP clients that read it (such as Claude Code) pick the server up automatically. For other clients:

```bash
claude mcp add debuff -- npx -y @debuffjp/mcp        # Claude Code
```

```json
{
  "mcpServers": {
    "debuff": { "command": "npx", "args": ["-y", "@debuffjp/mcp"] }
  }
}
```

Run it from the game's folder, or pass `--root <dir>` (or set `DEBUFF_ROOT`).

As a Claude Code plugin, which also adds a skill that teaches Claude the workflow:

```bash
/plugin marketplace add debuffjp/debuff
/plugin install debuff@debuff
```

As a Codex plugin: `codex plugin marketplace add debuffjp/debuff`, then `codex plugin add debuff@debuff`.

For Claude Desktop, `mcpb/manifest.json` describes a desktop extension that asks for the game folder. Pack it from that folder with `npx @anthropic-ai/mcpb pack`.

## Tools

| Tool | What it does |
| --- | --- |
| `inspect_project` | Dependencies, plugins and their contributions, assets, last build size |
| `list_assets` | Every asset with its type, size and importer, plus warnings and possibly unused ids |
| `typecheck` | Type-check with the project's own `tsc`; no browser needed. Vite doesn't type-check, so run it after edits |
| `build` | Production build plus size report; `leaks` must be empty |
| `run_tests` | Run the logic tests in `tests/` ([keiko](https://github.com/debuffjp/debuff/tree/main/tooling/keiko)): the real game in Node, no browser; failures carry the tick, scene and state |
| `run_scenarios` | Run `scenarios/*.json` headless; per-step results, errors, captures |
| `fuzz` | Play with random input; each crash, stuck state or back-and-forth loop comes with an explained error and a scenario that replays it |
| `game_start` | Attach to the live game, or open a private headless copy, paused (see below). Headless takes a `viewport: [w, h]`; `reducedMotion` forces it on or off |
| `game_step` | Advance fixed simulation steps (pausing first); returns state (`quiet` leaves out your `inspect()` data) |
| `game_pause` | Pause or resume a live game |
| `game_frames` | Recent frame breakdown: update/render ms, catch-up steps, quads, draw calls, long tasks; `summary` gives percentiles and the 3 slowest |
| `game_notes` | Moments the human flagged in the overlay, with the state at that tick |
| `game_rewind` | Live mode: take the human's game back (or forward) to a tick, paused, with its exact state then |
| `game_replay` | Save the live session up to a tick (for example a note's) as a scenario in `.debuff/replays/` that reproduces it |
| `game_input` | `press` / `release` keys (and `PointerRight` / `PointerMiddle`); `tap`, `pointer_down` (with an optional `kind`: mouse, touch or pen), `pointer_move`, `pointer_up`; `wheel` (`dy`, `dx`); `touch_down`, `touch_move`, `touch_up` by contact `id` |
| `game_state` | Scene, tick, logical width/height, renderer, frame stats, `reducedMotion`, your `inspect()` data |
| `game_command` | Run a command the game registered with `devTools({ commands })`, with JSON args |
| `game_params` / `game_set_param` | Read and tune typed params (validated) |
| `game_capture` | The current frame as a PNG image; `path` also saves it in the project (thumbnails, store art). `social: true` letterboxes it into 1200×675 for X and Bluesky posts (added in 0.24) |
| `game_clip` | Live mode: `start` a rolling recording, `save` the last 15 s as a video in `.debuff/captures/`, `stop`. For devlogs and press kits; the human posts. Added in 0.24 |
| `game_errors` | Runtime errors, explained: whose problem (your code, a rejected call, a debuff bug), the source line, a hint |
| `game_stop` | Close the game |
| `report_papercut` | Report tooling friction in debuff, keiko, myaku, spryte or debuff.jp to [papercuts.debuff.jp](https://papercuts.debuff.jp). Returns close matches instead of filing a duplicate; call again with `hit: <id>` or `force: true`. With `hit`, `workaround` fills the papercut's workaround when it has none (from 0.24.1). Added in 0.24 |

Tool calls that fail on setup twice in a week, or run far too long, are reported to papercuts.debuff.jp on their own, and the result says so (see `debuff papercuts` in the CLI README to turn it off). From 0.24.

## Prompts

Workflows clients can offer as slash commands: `playtest`, `fix-errors`, `tune-feel`, `add-mechanic`, `devlog-post` (added in 0.24: capture a still and a clip, then draft short posts for the human to send) and `explain-stutter`.

## Live and headless

If you have the game open under `debuff dev`, `game_start` attaches to **that tab** (mode `live`). The overlay shows an **agent** badge, and every pause, step and param change the agent makes appears in its activity log, where you can undo it. Type a note in the overlay ("jump feels floaty here") to flag a moment; the agent reads it, along with the game state at that tick, through `game_notes`. `game_stop` resumes your game and disconnects.

Otherwise, or with `mode: "headless"`, the agent gets a private copy in a headless browser. Time only advances through `game_step`, so what it sees is reproducible, and a scenario can replay it exactly.
