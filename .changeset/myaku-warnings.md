---
"myaku": minor
---

myaku says what it can't see instead of showing a quiet, healthy-looking report: `warnings()` (also in the report and the overlay) for no frames, no canvas context, span names past the limit, and a heap too coarse to see GC. `support.heap` now checks that heap readings actually change, and `unknown` verdicts say when GC can't be ruled out. Span names past 16 are added up under `other` instead of dropped.
