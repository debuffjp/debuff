---
"@debuffjp/dev": patch
---

Runtime errors thrown inside spryte, plonk or myaku are now explained as debuff's (`debuff-usage` or `debuff-bug`, with a report link) instead of `your-code`. Before 0.24.2 only `@debuffjp/*` packages counted, so a bug inside the renderer or the music player was blamed on the game.
