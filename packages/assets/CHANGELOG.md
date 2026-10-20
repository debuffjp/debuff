# @debuffjp/assets

## 0.9.5

No changes in this release.

## 0.9.4

No changes in this release.

## 0.9.3

No changes in this release.

## 0.9.2

### Patch Changes

- 9ee5b42: Only the left mouse button presses `Pointer`, keys release when focus leaves the keyboard target, and asset URLs carry a content hash so a redeploy can't mix old and new atlases.

## 0.9.1

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.0

No changes in this release.

## 0.7.1

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.1

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.0

### Minor Changes

- 1487920: Automatic texture atlases. The asset pipeline packs PNGs per preload group into atlases (MaxRects, lossless, padded and edge-extruded), in dev and builds, cached by content hash. It's on by default; configure with `assets.atlas` in `debuff.config.ts` (`maxSize`, `padding`, `exclude`, or `false`).
  
  - `@debuffjp/assets`: new `frame(id)` and `frames(id)` work for atlased and standalone images, and assets sharing an atlas share one request. `image(id)` explains what to use for atlased assets.
  - `@debuffjp/tilemap`: tilesets accept an atlas region (`assets.frame(id)`).
- 0cb047e: Streamed music: `audio.stream(url, { bus, volume, loop })` plays long tracks through an `<audio>` element into a bus, with no full decode into memory, so playback starts immediately. It waits for the autoplay unlock if needed and returns `pause`, `resume`, `volume(value, fade)` and `stop(fade)`. `assets.url(id)` returns an asset's URL without downloading it.

### Patch Changes

- aa0314b: Robustness fixes:
  
  - WebGL context loss: the renderer pauses while the context is lost and rebuilds itself on restore, re-uploading textures from their sources. No more black screen after mobile tab switches or GPU resets. `game.dispose()` now releases GPU resources.
  - Image loading no longer waits on `decode()`, which can stall indefinitely in background tabs and throttled iframes and left games stuck loading.
