---
"keiko": patch
---

Tests no longer hang forever when a game imports a dependency Vite has not pre-bundled yet. Vite's dependency optimizer now gets real timers, and a boot that never settles fails with an error after its timeout instead of waiting forever.
