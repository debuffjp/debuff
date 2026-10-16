# @debuffjp/audio

A small Web Audio facade: music and SFX buses, autoplay unlock on the first gesture, buffer playback with pitch variation, and an asset-free synth for placeholder or stylised SFX. No dependencies.

```ts
import { Audio } from "@debuffjp/audio";

const audio = new Audio();
await audio.decode("coin", assets.audio("coin"));

audio.play("coin", { volume: 0.8, rateJitter: 0.05 });
audio.synth({ freq: 660, freqEnd: 220, decay: 0.15 }); // no file needed
audio.volume("music", 0.5);
```

## API

- `decode(id, arrayBuffer)`, `has(id)`
- `play(id, { bus, volume, rate, rateJitter, pan, loop })` → `Voice`
- `synth({ wave, freq, freqEnd, attack, decay, volume, bus })` → `Voice` (`wave`: any `OscillatorType` or `"noise"`)
- `voice.stop(fadeSeconds?)`
- `volume("sfx" | "music" | "master", value)`, `unlocked`, `ctx` (the underlying `AudioContext`)
