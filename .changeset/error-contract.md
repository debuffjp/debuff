---
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
---

A failure contract for scripts and agents. The exit code says what to do next: 1 a run reported a failure, 2 setup needs fixing (run `debuff doctor`; `doctor` itself now exits 2 when a required check fails), 3 bad input. With `--json`, stdout carries exactly one JSON document, and a command that can't run prints `{ "error": { "code", "message", "fix", "transient" } }` with a stable `code`. Unknown options are now an error instead of being ignored, and `scenario --json` no longer prints a log line before its JSON. MCP tool errors carry the same code and fix.
