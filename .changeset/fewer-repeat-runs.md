---
"@debuffjp/mcp": minor
"@debuffjp/cli": patch
---

Fewer repeat test runs and idle browsers. A headless `game_start` closes its browser and dev server after 15 idle minutes. The agent guide, MCP tool descriptions and the `untested` hook now say to run only the tests a change touches while working and the whole suite once at the end. Dev-server type-check messages go through Vite's logger, so they no longer land in the MCP server's stdout.
