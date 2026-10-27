# debuff plugin for Claude Code and Codex

Make 2D browser games with Claude or Codex. [debuff](https://debuff.jp) is an open-source TypeScript framework that handles the game loop, controls, crisp pixels, sound, levels, testing and the web build. This plugin lets your agent start a game for you and then work on it the way a playtester would.

- **A running game in a minute.** Ask for a platformer, a top-down adventure or a blank start. The agent scaffolds it with `npm create debuff`.
- **The agent can see the game.** It plays it headless or in the tab you have open, takes captures, reads live state and steps time frame by frame.
- **Tune the feel together.** Speeds and timings are live params. The agent proposes variants, you pick.
- **Changes come with evidence.** Scenario tests, explained runtime errors and frame timings show whether a change worked.
- **You keep the creative calls.** Art, feel, difficulty and names stay with you.

## Install

```bash
/plugin marketplace add debuffjp/debuff
/plugin install debuff@debuff
```

In Codex:

```bash
codex plugin marketplace add debuffjp/debuff
codex plugin add debuff@debuff
```

Then ask something like "make me a small platformer" or "playtest my game". Requires Node.js 22 or newer.

Projects made with `npm create debuff` also include a `.mcp.json` with the same server, for other MCP clients. With this plugin installed, decline that project server when Claude Code asks, so the tools don't show up twice. Codex doesn't read `.mcp.json`, so it isn't affected.

## Install sources

The server installs from this folder's `package-lock.json`: `@debuffjp/mcp` and its dependencies, all from the public npm registry. The `package.json` and lockfile at the repository root belong to the debuff monorepo and aren't used by the plugin.

## Community

Come say hi on [Discord](https://discord.gg/jshbDHSpCY), the debuff community's home. Docs at [debuff.jp](https://debuff.jp), privacy at [debuff.jp/privacy](https://debuff.jp/privacy).
