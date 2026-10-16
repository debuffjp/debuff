---
"@debuffjp/cli": patch
"@debuffjp/mcp": patch
"create-debuff": patch
---

Bin paths are now written as `bin/x.js` instead of `./bin/x.js`. npm 11 treats the `./` form as invalid and strips the command, which would have left `debuff`, `debuff-mcp` and `npm create debuff` with nothing to run.
