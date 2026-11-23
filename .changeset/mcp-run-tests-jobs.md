---
"@debuffjp/mcp": minor
---

`run_tests` takes `jobs`: a number of worker processes, or `"auto"` for one per CPU core. It runs test files in parallel through `debuff test --jobs`, with the same report as a serial run.
