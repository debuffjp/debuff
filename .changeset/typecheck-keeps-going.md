---
"@debuffjp/cli": patch
---

`debuff dev`'s background type check keeps running after a result listener throws. Before, the throw left it marked as running, so every later check only queued and type errors stopped appearing until a restart. Closing the dev server now also stops a check that's in progress from reporting.
