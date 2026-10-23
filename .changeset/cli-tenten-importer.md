---
"@debuffjp/cli": minor
---

`.tt` sprites drawn with [tenten](https://github.com/debuffjp/tenten), the pixel-art MCP server for agents, become PNGs and sprite sheets in `assets/` with no configuration, like `.aseprite` files do with `aseprite()`. tenten is found in `$TENTEN` or the project, and otherwise fetched with `npx -y -p @debuffjp/tenten tenten` the first time a `.tt` file appears; `tenten({ command })` overrides that. New projects' `.mcp.json` lists the tenten server next to debuff's, and the template agent guides, the debuff skill and the MCP server tell agents to draw pixel art with tenten unless the human names another tool.
