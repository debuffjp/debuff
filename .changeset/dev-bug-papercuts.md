---
"@debuffjp/dev": patch
"@debuffjp/cli": patch
---

`debuff dev` reports bugs inside debuff that the dev tools catch as automatic papercuts, the way the CLI already reports repeated setup failures. A report holds the error name and up to three debuff functions (`TypeError at spryte.js:Canvas2D.flush`, now on `ExplainedError.signature`), never the message, line numbers or anything from the game, and goes only after it's been seen in two page loads in a week. The papercuts notice now mentions these reports and is shown once more before any are sent. Off with `debuff papercuts off`, as before.
