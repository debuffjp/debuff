---
"@debuffjp/cli": patch
---

On Windows, a command that ran the daily update check (or sent telemetry) could finish its work and then abort with a libuv `UV_HANDLE_CLOSING` assertion and exit code 127, so `debuff build && tsc` stopped after a good build. The CLI now lets those connections close before it exits.
