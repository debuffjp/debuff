---
"myaku": patch
---

`record --trace` no longer says hitches went unseen when the trace has no presented frames or ended early (they are now "not covered by the trace"), notes when Chrome's trace buffer filled, and only blames the compositor when it can see canvas GPU work.
