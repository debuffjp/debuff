---
"keiko": patch
"myaku": patch
---

keiko: `new Date()` and `Date()` now run on the virtual clock, not just `Date.now()`. `test.deterministic` now gives its second run a different date as well as a different seed, as documented. A pointer press at a new position now moves the pointer there first, as in a browser, so engines that only track the position on moves (KAPLAY) see the right spot. myaku: corrections to the README. Both packages are now checked against real Phaser 3 and 4, PixiJS, KAPLAY, Excalibur and three.js with a local suite (`npm run compat`).
