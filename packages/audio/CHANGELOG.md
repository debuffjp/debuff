# @debuffjp/audio

## 0.34.0

No changes in this release.

## 0.33.2

No changes in this release.

## 0.33.1

No changes in this release.

## 0.33.0

No changes in this release.

## 0.32.0

No changes in this release.

## 0.31.1

### Patch Changes

- 466d128: Audio resumes on the next tap or key after the browser suspends it again, such as an iOS phone call or app switch. Before, the unlock listeners were removed after the second gesture and audio stayed silent.
  
  `audio.stream()` keeps one state (playing, paused or stopped). `stop()` is final: `resume()` after it does nothing, where before it restarted a track that the fade-out was about to unload. A blocked track waits for the context unlocking or the next pointer or key gesture, so music also starts where the context was already running but the element was blocked. Pausing and resuming a blocked track no longer piles up retry listeners.

## 0.31.0

No changes in this release.

## 0.30.0

### Minor Changes

- 1360baf: Add `audio.buffer(id)`, which returns a decoded sound so plugins can play it through their own nodes.

### Patch Changes

- 6cfb2c2: The README and JSDoc point music and sound effects at plonk (`plonkjs`) on `audio.bus("music")`, with `player.sfx` for effects in the song's key. `synth` stays, documented as a placeholder. Before 0.29.3 they suggested `synth` for stylised SFX, which steered agents to blips.

## 0.29.2

No changes in this release.

## 0.29.1

No changes in this release.

## 0.29.0

No changes in this release.

## 0.28.1

No changes in this release.

## 0.28.0

No changes in this release.

## 0.27.0

No changes in this release.

## 0.26.2

No changes in this release.

## 0.26.1

No changes in this release.

## 0.26.0

No changes in this release.

## 0.25.0

No changes in this release.

## 0.24.3

### Patch Changes

- df8a5df: Noise sounds now last as long as their envelope. Before this release a noise instrument (plonk) or noise synth (`audio.synth`) went silent after one second, however long its attack and decay, because the noise buffer was a second long and didn't loop. Wind, rain, surf and other long hisses now play in full.

## 0.24.2

No changes in this release.

## 0.24.1

No changes in this release.

## 0.24.0

No changes in this release.

## 0.23.0

No changes in this release.

## 0.22.1

No changes in this release.

## 0.22.0

No changes in this release.

## 0.21.1

No changes in this release.

## 0.21.0

No changes in this release.

## 0.20.0

No changes in this release.

## 0.19.0

No changes in this release.

## 0.18.0

No changes in this release.

## 0.17.0

No changes in this release.

## 0.16.0

No changes in this release.

## 0.15.0

No changes in this release.

## 0.14.0

No changes in this release.

## 0.13.3

No changes in this release.

## 0.13.2

No changes in this release.

## 0.13.1

No changes in this release.

## 0.13.0

### Minor Changes

- 8840cfb: New package, **plonk**: game music made in code. Songs are small data (instruments and patterns of notes), synthesized live with Web Audio: no audio files, about 2 kB brotli, any engine. Tempo changes without jumps, per-track layers that fade in and out, a tempo-synced echo, and `notes()` to see a song as data. `@debuffjp/audio` gains `audio.bus(name)`, so plonk (or anything else) can play through a game's music bus and share its mute.

## 0.12.0

No changes in this release.

## 0.11.0

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.5

No changes in this release.

## 0.9.4

No changes in this release.

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
