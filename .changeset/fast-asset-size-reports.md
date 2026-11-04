---
"@debuffjp/cli": patch
---

Speed up build size reports by using Brotli quality 4 for assets, source maps and other files. Code and HTML keep quality 11, so existing code size budgets stay comparable. Before 0.29.1, every file used quality 11. This also speeds up `debuff report`, `debuff inspect` and the MCP build tool without changing shipped files.
