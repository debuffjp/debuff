---
"myaku": minor
---

`myaku record --trace` records Chrome's own frame pipeline while it plays, and checks myaku against it: presented-frame percentiles next to the rAF ones, each hitch confirmed or flagged as not seen on screen, gaps myaku missed, and `unknown` hitches named `gpu` or `compositor` from evidence. A lone GPU stall on a lightly loaded GPU stays `unknown` and says it's likely outside the game. `--trace-out` saves the raw trace for DevTools or Perfetto. Opt-in and Chromium only; nothing changes in the page.

The display rate is now measured again every 30 frames, keeping the fastest rate seen, so a slow start (shaders compiling, a heavy first scene) no longer doubles the hitch budget for the whole run. `profiler.budgetMs` can now be set.
