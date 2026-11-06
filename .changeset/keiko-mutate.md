---
"keiko": minor
---

Add `keiko mutate`, which tests your tests. It pushes each param to the ends of its range (some test should fail), then runs with a different `Math.random()` seed and at 30 fps (every test should still pass), and lists what was missed or brittle in `mutants.out/`. Mutants are judged by henka, a new standalone package that keiko now depends on.
