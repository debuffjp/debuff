# @debuffjp/audio

## 0.9.3

No changes in this release.

## 0.9.2

No changes in this release.

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

## 0.1.1

### Patch Changes

- Republished: the 0.1.0 release was held in npm staging and can't be reused. No code changes from 0.1.0.

## 0.1.0

### Minor Changes

- 0cb047e: Streamed music: `audio.stream(url, { bus, volume, loop })` plays long tracks through an `<audio>` element into a bus, with no full decode into memory, so playback starts immediately. It waits for the autoplay unlock if needed and returns `pause`, `resume`, `volume(value, fade)` and `stop(fade)`. `assets.url(id)` returns an asset's URL without downloading it.
