---
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
---

New: `debuff papercut` and the MCP tool `report_papercut` report tooling friction (a slow or flaky tool, a missing API, confusing docs) to the public board at papercuts.debuff.jp. They show close matches first, so a repeat adds a hit with your minutes instead of a duplicate. Nothing is sent unless you run them, and only the text you wrote goes.

The CLI and MCP server also report debuff's own papercuts: a setup failure seen twice in a week, or a command or tool call far slower than it should be. They send a fixed title, an error code, minutes and the version, at most once a day per problem. Off with `debuff papercuts off`, `DEBUFF_PAPERCUTS=0` or `DEBUFF_TELEMETRY=0`, and skipped in CI.
