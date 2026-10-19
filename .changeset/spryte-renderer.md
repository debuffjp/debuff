---
"@debuffjp/core": minor
---

The renderer now lives in its own package, [spryte](https://www.npmjs.com/package/spryte), which core depends on and re-exports. Game code is unchanged. Also: texture coordinates are `highp` (fixes off-by-a-texel sampling in large atlases on some mobile GPUs), drawing one image both smooth and pixelated no longer re-uploads it, and `game.dispose()` frees every GPU object. New: `draw.font` sets the default font for `draw.text` (debuff sans in games).
