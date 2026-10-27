---
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
"create-debuff": patch
---

`debuff doctor` checks a project's setup in one pass and prints a fix for each problem: Node version, debuff packages on one version, `node_modules` matching `package.json`, a nested copy of `@debuffjp/core`, `@debuffjp/dev` and TypeScript, `debuff.config.ts`, the asset pipeline, `saves.json`, agent files (`AGENTS.md`, `CLAUDE.md`, `.mcp.json`), the browser scenarios use, and a `NODE_ENV` left set in the shell. `--live` also starts the dev server and checks the game exposes its dev hooks. It exits 1 when a required check fails, and `--json` prints every check with an id. The MCP server gains a `doctor` tool, and new projects' `AGENTS.md` lists the command.
