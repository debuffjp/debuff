---
"keiko": patch
---

`afterEach` runs even when a `beforeEach` throws, as in Vitest and Jest. Before, a failing `beforeEach` skipped every `afterEach`, so their cleanup never ran. The test still fails with the `beforeEach` error.
