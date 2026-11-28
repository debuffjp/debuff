---
"keiko": minor
---

`expect(value).toMatchObject(subset)` passes when `value` has every key `subset` names, compared as `toEqual` does; other keys are ignored at any depth. Arrays need the same length, and a failure names the first path that differs.
