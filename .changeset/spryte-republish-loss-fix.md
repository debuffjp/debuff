---
"spryte": patch
---

Republish of the shared-mode context-loss fix: 0.4.1 was published from a build made before it, so its `createSharedRenderer` still misses a loss restored between two frames. 0.4.2 carries the fix.
