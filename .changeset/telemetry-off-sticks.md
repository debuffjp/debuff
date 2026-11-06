---
"@debuffjp/cli": patch
---

`debuff telemetry off` can no longer be undone by another debuff command running at the same time. The daily update check read the user config, waited on the npm registry, then wrote back what it had read, so turning telemetry off during that wait was lost. Config writes now merge into the file as it is when they write, and replace it in one step, so a half-written file is never read as an empty config (which means telemetry on).
