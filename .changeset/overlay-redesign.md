---
"@debuff/dev": minor
---

Redesigned the dev overlay. It now has a toolbar (pause, step, speed, snap, restart) and four tabs: perf, tune, state and log.

- **perf**: frames are coloured by health, and a summary shows headroom and whether dropped frames came from the game or from outside it. Normal display jitter is no longer reported as a problem.
- **tune**: changed values are marked, you can double-click a name to reset it, and "copy changes" copies only what you tuned.
- **state**: shows the scene's `inspect()` data live.
- **log**: errors get a header badge.

Arrow keys on a focused slider no longer drive the game. New exports: `summarize` and `HITCH`. The dev hooks' `errors()` now come from the shared session.
