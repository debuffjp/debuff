---
"myaku": patch
---

Hidden and throttled frames no longer count against fps, percentiles or hitch rate (reported under `paused`). Percentiles use nearest rank, so p99 of a short run is no longer always the max. `--trace` ignores screen gaps after the recording ended, uses the trace's refresh rate when the page couldn't measure one, and clips script time to the frame it blames.
