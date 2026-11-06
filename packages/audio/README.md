# @debuffjp/audio

A small Web Audio facade: music and SFX buses, autoplay unlock on the first gesture, buffer playback with pitch variation, and an asset-free synth for quick placeholder blips. No dependencies.

```ts
import { Audio } from "@debuffjp/audio";

const audio = new Audio();
await audio.decode("coin", assets.audio("coin"));

audio.play("coin", { volume: 0.8, rateJitter: 0.05 });
audio.volume("music", 0.5);
```

## Music and sound effects

For music and sound effects made in code, use [plonk](https://debuff.jp/plonk/) (`plonkjs`): songs and effects are small data, synthesized live, and effects play in the song's key. Give it this package's context and music bus so it shares the game's volume and mute:

```ts
import { Player } from "plonkjs";

const player = new Player({ context: audio.ctx, destination: audio.bus("music") });
player.play(theme); // a plonk Song
player.sfx({ wave: "square", decay: 0.1, sustain: 0 }, { degree: 5 }); // a pickup in the song's key
```

Use `play` for sound files the game ships. `synth` is a single oscillator with a pitch slide: fine as a placeholder while a game has no sound yet, but it can't make a convincing coin, explosion or power-up. Before 0.29.3, this README suggested `synth` for stylised SFX too.

```ts
audio.synth({ freq: 660, freqEnd: 220, decay: 0.15 }); // placeholder, no file needed
```

## API

- `decode(id, arrayBuffer)`, `has(id)`
- `play(id, { bus, volume, rate, rateJitter, pan, loop })` → `Voice`
- `synth({ wave, freq, freqEnd, attack, decay, volume, bus })` → `Voice` (`wave`: any `OscillatorType` or `"noise"`)
- `voice.stop(fadeSeconds?)`
- `bus("sfx" | "music")` → `GainNode`, to plug in other audio such as plonk
- `volume("sfx" | "music" | "master", value)`, `unlocked`, `ctx` (the underlying `AudioContext`)
