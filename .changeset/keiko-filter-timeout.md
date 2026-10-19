---
"keiko": patch
---

`-t/--filter` no longer hides test files that fail to load, and a filter that matches no tests now fails. A test that times out can no longer close the next test's page when it calls `play()` late.
