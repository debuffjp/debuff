---
"keiko": patch
---

Without debuff, `touchDown(id, ...)` now sends `pointerId` id + 2, so a finger never shares the mouse's pointerId 1. Touch events keep the id you passed.
