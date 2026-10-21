---
"@debuffjp/core": minor
---

New `scale: "expand"` mode for responsive games. Like `fit`, but instead of letterboxing, the logical size grows along the spare axis to fill the container: `width`/`height` become the minimum, `game.width`/`game.height` follow the container, and `game.hooks.resize(fn)` fires when they change. One game can be portrait on phones and landscape on a desktop portal.
