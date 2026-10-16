---
"@debuff/tilemap": minor
"@debuff/cli": minor
---

New `@debuff/tilemap`: a `Tilemap` with culled, allocation-free rendering through `draw` (with parallax and Tiled flip and rotation flags), tile collision via `map.move(body, dx, dy)` with one-way platforms and no tunnelling, and importers for Tiled (`fromTiled`) and LDtk (`fromLdtk`). The asset pipeline now loads `.tmj`, `.tsj` and `.ldtk` files as JSON.
