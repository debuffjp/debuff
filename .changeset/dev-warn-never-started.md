---
"@debuffjp/core": patch
---

In dev builds, `Game` now warns when it starts with no active scene ("call `game.go(id)` first"), or when scenes were added but `game.start()` was never called, instead of silently drawing only the background. Dev-only checks are also written so bundlers fully drop them from production builds.
