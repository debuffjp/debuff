---
"@debuffjp/cli": patch
---

`debuff scenario` and `debuff fuzz` close their dev server, and any browser they started, when a run fails before it begins: no URL from the server, no Chrome to launch, or a config that won't load. Before, the server and its file watcher kept running. The CLI exits anyway, but the MCP server runs these in one long-lived process, so each failed `run_scenarios` or `fuzz` call there kept a port and a watcher open.
