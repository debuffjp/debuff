---
"@debuffjp/core": patch
---

A loop error's `phase` no longer carries over from an earlier step that threw, or from the last update hook: an error outside the labelled parts of a frame (such as `draw.begin`) now reports `"idle"`. `GameErrorContext.phase` is typed as the new `GamePhase` union instead of `string`, so code comparing it with a name that never occurs now fails to type-check.
