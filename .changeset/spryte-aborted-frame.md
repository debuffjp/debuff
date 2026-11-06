---
"spryte": patch
---

On WebGL2, a frame that threw before `end()` no longer leaks its unfinished batch into the next frame. Before, the next `begin()` cleared the screen and then drew the stale sprites and shapes on top.
