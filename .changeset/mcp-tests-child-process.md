---
"@debuffjp/mcp": patch
---

`run_tests` runs the logic tests in a child process (`debuff test --json`) instead of inside the MCP server. keiko swaps process globals (timers, `Date`, `performance`, `window`, `document`) while a test runs, and in the server those were also the MCP connection's and the headless browser's. Their timers stalled during a run, and two overlapping runs could leave the server's globals patched. Results now match `debuff test` exactly, saves check included. A root without a package.json is an error instead of an empty pass.
