---
"@debuffjp/cli": minor
"@debuffjp/mcp": patch
---

`debuff doctor --fix` applies the safe fixes it finds: install, dedupe, adding `@debuffjp/dev`, and writing a missing `.mcp.json`, in the project's package manager. Commands that fail on setup now end with a pointer to `debuff doctor`. The MCP server's instructions get a missing space back.
