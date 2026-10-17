# debuff plugin for Claude Code

Adds the debuff MCP server (`@debuffjp/mcp`) and a skill that teaches Claude how to see, play, tune and verify a debuff game.

```bash
/plugin marketplace add debuffjp/debuff
/plugin install debuff@debuff
```

Open Claude Code in your game's folder. The server uses the current folder as the project.

Projects made with `npm create debuff` also include a `.mcp.json` with the same server, for clients other than Claude Code. If you have this plugin installed, decline that project server when Claude Code asks, so the tools don't show up twice.
