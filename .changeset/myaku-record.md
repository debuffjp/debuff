---
"myaku": minor
---

`npx myaku record [dist|url]`: plays the game in Chrome or Edge with myaku injected (no changes to the game, works on production builds), prints frame-time percentiles and the worst hitches, and fails when `--p95`, `--p99` or `--hitches` budgets are exceeded. `--play` drives the game with a Playwright script, `--cpu` throttles the CPU, `--json`/`--out` write the report. Adds `profiler.reset()`.
