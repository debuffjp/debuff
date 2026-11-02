---
"@debuffjp/core": minor
---

`clock: { budgetMs }` stops a frame catching up once its steps have used that many milliseconds. A simulation too heavy for real time then runs slower at a steady frame rate: in a test with 20 ms steps, 7 fps became 50 fps at the same simulation speed.
