---
"myaku": minor
---

`update` and `render` spans for Excalibur (found automatically) and KAPLAY (automatic with its default globals, or `adapt(profiler, k)`). PixiJS apps are now found even when Pixi runs its devtools hook before the ticker is set up, which left real games like Puzzling Potions and Bubbo Bubbo without spans.
