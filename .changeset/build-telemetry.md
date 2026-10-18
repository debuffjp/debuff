---
"@debuffjp/cli": minor
---

`debuff build` registers the project anonymously with debuff.jp (a random project id, the package name and the CLI version; nothing about code, paths or players), so we can find games made with debuff. A one-time notice says so. Turn it off with `debuff telemetry off` or `DEBUFF_TELEMETRY=0`; it is off in CI. Details: https://debuff.jp/docs/telemetry
