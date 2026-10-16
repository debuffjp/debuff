---
"@debuff/core": patch
"@debuff/assets": patch
---

Robustness fixes:

- WebGL context loss: the renderer pauses while the context is lost and rebuilds itself on restore, re-uploading textures from their sources. No more black screen after mobile tab switches or GPU resets. `game.dispose()` now releases GPU resources.
- Image loading no longer waits on `decode()`, which can stall indefinitely in background tabs and throttled iframes and left games stuck loading.
