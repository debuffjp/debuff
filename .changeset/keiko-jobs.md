---
"keiko": minor
---

`keiko --jobs <n>` (`jobs` in `runTests()`) runs test files in n worker processes at once, and `--jobs auto` starts one per CPU core. A file's tests stay together in one worker, in order, and files that took longest last time start first. The report, the `--json` output and the `--changed` queue are the same as a run in one process. A run with `.only` in any file stays in one process. Each worker pre-bundles into its own `node_modules/.vite/keiko-<n>`. The queue now records each test's duration. Closes #123.
