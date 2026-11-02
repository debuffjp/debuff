---
"@debuffjp/dev": minor
---

The dev tools now say when most sprites are drawn outside the view: a console warning once, a line in the overlay's frame inspector, and `drawHint` in `profile()` and `game_profile`. It measures one frame in sixty and needs at least 1,000 such sprites making up half the frame, so small games never see it. Template agent guides and the debuff skill now tell agents to cull.
