# @debuffjp/tilemap

## 0.5.0

### Patch Changes

- Updated dependencies [1f17bac]
- Updated dependencies [b37f2d9]
- Updated dependencies [60fd560]
- Updated dependencies [092b259]
- Updated dependencies [a162599]
- Updated dependencies [28b3d48]
  - @debuffjp/core@0.5.0

## 0.4.0

### Patch Changes

- @debuffjp/core@0.4.0

## 0.3.3

### Patch Changes

- @debuffjp/core@0.3.3

## 0.3.2

### Patch Changes

- @debuffjp/core@0.3.2

## 0.3.1

### Patch Changes

- @debuffjp/core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [1f5fb28]
- Updated dependencies [d716ede]
- Updated dependencies [134c84a]
  - @debuffjp/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [ab5dcf1]
- Updated dependencies [78f0a71]
- Updated dependencies [2eccd11]
- Updated dependencies [035dfd9]
  - @debuffjp/core@0.2.0

## 0.1.0

### Minor Changes

- 1487920: Automatic texture atlases. The asset pipeline packs PNGs per preload group into atlases (MaxRects, lossless, padded and edge-extruded), in dev and builds, cached by content hash. It's on by default; configure with `assets.atlas` in `debuff.config.ts` (`maxSize`, `padding`, `exclude`, or `false`).
  
  - `@debuffjp/assets`: new `frame(id)` and `frames(id)` work for atlased and standalone images, and assets sharing an atlas share one request. `image(id)` explains what to use for atlased assets.
  - `@debuffjp/tilemap`: tilesets accept an atlas region (`assets.frame(id)`).
- 9a37bb7: New `oneWayTolerance` option for `move()`. A falling body whose feet are up to that many pixels inside a one-way platform still lands, snapping up onto it. Set it to the plank art's thickness, so a jump that visually reaches the platform catches it instead of dropping back through.
- 451831a: New `@debuffjp/tilemap`: a `Tilemap` with culled, allocation-free rendering through `draw` (with parallax and Tiled flip and rotation flags), tile collision via `map.move(body, dx, dy)` with one-way platforms and no tunnelling, and importers for Tiled (`fromTiled`) and LDtk (`fromLdtk`). The asset pipeline now loads `.tmj`, `.tsj` and `.ldtk` files as JSON.

### Patch Changes

- Updated dependencies [9d71ad0]
- Updated dependencies [38d968c]
- Updated dependencies [77b3998]
- Updated dependencies [f807f89]
- Updated dependencies [71b6dd3]
- Updated dependencies [2d2a302]
- Updated dependencies [a4f2549]
- Updated dependencies [55b9ead]
- Updated dependencies [aa0314b]
- Updated dependencies [27118f8]
- Updated dependencies [567c0b7]
- Updated dependencies [f50defb]
  - @debuffjp/core@0.1.0
