---
"@debuffjp/dev": minor
---

Experimental: dev builds register the game's dev hooks as WebMCP tools (`document.modelContext`) when the browser supports it, so a WebMCP-capable agent can play and inspect the game with no MCP server. The 10 tools use the same names and arguments as `@debuffjp/mcp`. Production builds don't change. Turn it off with `devTools({ webmcp: false })`.
