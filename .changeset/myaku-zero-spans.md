---
"myaku": patch
---

Spans that ran but measured 0 ms (the browser rounds `performance.now()`) now still appear in frames and reports, instead of looking as if the engine was never hooked up.
