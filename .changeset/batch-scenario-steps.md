---
"@debuffjp/cli": patch
---

`debuff scenario` sends each run of input, `wait` and `checkpoint` steps to the page in one call, up to ten seconds of play at a time, instead of one call per step. Recorded replays have a step on nearly every tick, so a five-minute replay with mouse input took 90 to 106 s before 0.31 and now takes under 3 s. Results are still reported per step: a failing step fails alone and the rest still run. When the game hangs inside a batch, the message names the range of steps it was in.
