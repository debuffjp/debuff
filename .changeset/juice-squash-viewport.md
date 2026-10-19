---
"@debuffjp/juice": patch
"@debuffjp/cli": minor
---

- **juice:** `squash()` only replaces scale tweens, so a move or fade already running on the same object keeps going (it used to stop every tween on its target). `tweens.kill(target, props?)` can stop just some properties, and `tweens.has(target, prop?)` says whether something is still animating.
- **Scenarios and fuzz:** set the browser viewport with `scenarios: { viewport: [360, 640] }` in `debuff.config.ts`, or `"viewport"` in a scenario file, so portrait games are tested at their own shape instead of shrunk into 960×540.
