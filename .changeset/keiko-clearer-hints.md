---
"keiko": patch
---

Clearer failures: a `test.deterministic` divergence between runs with different seeds suggests `{ sameSeed: true }` when the game takes its randomness from `Math.random()`, and an `until()` or `eventually()` that times out with the state unchanged since the last pointer `tap()` says the tap may have missed or landed before its target took input.
