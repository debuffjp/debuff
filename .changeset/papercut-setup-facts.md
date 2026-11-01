---
"@debuffjp/cli": patch
---

Automatic papercuts now say which machine they came from (OS, CPU count, memory and Node version) and what was checked: for `browser_not_found`, whether `DEBUFF_BROWSER` was set and whether Chrome, Edge and Chromium were missing or failed to start. Still no messages, paths or project names. The notice is shown again before the first report with these.
