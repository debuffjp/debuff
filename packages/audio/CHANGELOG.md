# @debuffjp/audio

## 0.1.0

### Minor Changes

- 0cb047e: Streamed music: `audio.stream(url, { bus, volume, loop })` plays long tracks through an `<audio>` element into a bus, with no full decode into memory, so playback starts immediately. It waits for the autoplay unlock if needed and returns `pause`, `resume`, `volume(value, fade)` and `stop(fade)`. `assets.url(id)` returns an asset's URL without downloading it.
