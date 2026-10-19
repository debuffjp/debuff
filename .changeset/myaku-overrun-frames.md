---
"myaku": patch
---

Frames whose own code overran the budget (say 31 ms of game code) are now hitches even when Chrome stamps the next frame on time. They were invisible before, and too short for Long Animation Frames, which only reports frames over 50 ms.
