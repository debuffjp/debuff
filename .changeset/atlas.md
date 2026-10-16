---
"@debuff/cli": minor
"@debuff/assets": minor
"@debuff/tilemap": minor
"@debuff/mcp": patch
---

Automatic texture atlases. The asset pipeline packs PNGs per preload group into atlases (MaxRects, lossless, padded and edge-extruded), in dev and builds, cached by content hash. It's on by default; configure with `assets.atlas` in `debuff.config.ts` (`maxSize`, `padding`, `exclude`, or `false`).

- `@debuff/assets`: new `frame(id)` and `frames(id)` work for atlased and standalone images, and assets sharing an atlas share one request. `image(id)` explains what to use for atlased assets.
- `@debuff/tilemap`: tilesets accept an atlas region (`assets.frame(id)`).
