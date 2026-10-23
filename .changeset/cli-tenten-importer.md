---
"@debuffjp/cli": minor
---

`tenten()` tooling plugin: `.tt` sprites drawn with [tenten](https://github.com/debuffjp/tenten), the pixel-art MCP server for agents, become PNGs and sprite sheets in `assets/` like `.aseprite` files do. tenten is found in `$TENTEN` or the project, and otherwise fetched with `npx -y tenten` the first time a `.tt` file appears. New projects' `.mcp.json` lists the tenten server next to debuff's.
