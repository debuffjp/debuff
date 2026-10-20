---
"@debuffjp/cli": minor
"@debuffjp/dev": minor
"@debuffjp/mcp": minor
---

Type errors while you play: set `typecheck: true` in `debuff.config.ts` and `debuff dev` type-checks with your project's own `tsc` after every save. Type errors show as a badge and cards in the dev overlay (the game keeps running), in `window.__DEBUFF_DEV__.typeErrors()`, and to agents through the new `typecheck` MCP tool, which also works without a browser.
