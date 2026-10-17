# ADR 0010: Procedural sound effects, tunable like any other param

- Status: proposed
- Date: 2026-10-17

## Context

Small games need many short sound effects: jumps, coins, hits, menu blips. Recording or finding them is slow, and placeholder sounds rarely get replaced. Generators in the sfxr family answer this, and [ZzFX](https://github.com/KilledByAPixel/ZzFX) (Frank Force, MIT) is the modern standard: one sound is about 20 numbers, rendered to samples in a few lines of JavaScript, with a [web designer](https://killedbyapixel.github.io/ZzFX/) that exports those numbers. LittleJS ships it built in, and it's a big part of why that engine is jam-friendly.

`@debuffjp/audio` already has `synth()`, a single oscillator with a pitch slide. It's useful for placeholders but can't make a convincing coin, explosion or power-up.

What would make this debuff's own rather than a copy: sounds as **params**. A sound becomes a typed, ranged, inspectable value, so the dev overlay can tune it with sliders while you play, an agent can propose variants within ranges, and tests and replays treat it like any other tuning.

## Proposal

### 1. A generator in `@debuffjp/audio`

```ts
import { sfx } from "@debuffjp/audio";

const coin = sfx({ frequency: 1400, attack: 0, sustain: 0.04, release: 0.2, pitchJump: 600, pitchJumpTime: 0.05 });
audio.play(coin);                       // render once, cache the buffer, play on the sfx bus
audio.play(coin, { rateJitter: 0.05 }); // all existing PlayOptions apply
```

- The parameter set is ZzFX's, named in full words (`frequency`, `attack`, `sustain`, `release`, `shape`, `shapeCurve`, `slide`, `deltaSlide`, `pitchJump`, `pitchJumpTime`, `repeatTime`, `noise`, `modulation`, `bitCrush`, `delay`, `sustainVolume`, `decay`, `tremolo`, `filter`), each with a documented unit and range.
- **Sample-compatible with ZzFX**: the same numbers render the same samples, verified against reference output in tests. `sfx.fromZzfx([...])` and `sfx.toZzfx(spec)` convert to and from the designer's arrays, so people can design there and paste here.
- **Deterministic**: ZzFX's `randomness` draws from a seeded generator, not `Math.random()`, so sounds don't break replays or `test.deterministic`.
- Rendered offline into an `AudioBuffer` and cached by spec, so playing a sound costs a buffer source, not synthesis.
- Tree-shaken when unused; target under 1.5 kB brotli for the generator. `debuff build` reports it.
- `synth()` stays for compatibility; docs point new code at `sfx()`.

### 2. Sounds as params

```ts
const sounds = game.params.define("sfx", {
  coin: sfx.param({ frequency: 1400, sustain: 0.04, release: 0.2, pitchJump: 600, pitchJumpTime: 0.05 }),
  jump: sfx.param(sfx.preset("jump")),
});
audio.play(sounds.values.coin);
```

- A new param type, `sound`, whose value is a spec. Each field keeps its range, so validation, the overlay and agents all know the bounds.
- **Dev overlay**: the tune tab shows each sound as a row with a play button, a small waveform, and sliders for its fields; changes are logged with undo, like every param. "Copy" puts `sfx({...})` or the ZzFX array on the clipboard.
- **Agents**: `game_params` and `game_set_param` work unchanged. A new MCP tool, `game_sound`, returns a sound's waveform as an image plus duration, peak and loudness, so an agent that can't hear can still compare variants and describe them. The `tune-feel` prompt covers sound: propose two or three variants and let the human listen and choose.
- **Presets** (`sfx.preset("coin" | "jump" | "hit" | "explosion" | "powerup" | "blip", seed?)`) are starting points, sfxr-style, seeded so the same call gives the same sound.

### 3. Sounds in tests

- In dev builds, `audio` records what played (sound name or spec hash, tick, bus, volume) into a `game.inspect` provider, so scenarios, keiko tests and agents can check "the jump plays the jump sound" without hearing it:

  ```ts
  game.tap("Space");
  expect(game.get("plugins.audio.played")).toContain("sfx.jump");
  ```

- keiko's inert Web Audio already lets these games run headless; rendering is pure JavaScript, so keiko could also assert on rendered samples (length, peak) if that proves useful.

## Phases

1. `sfx()` generator, ZzFX conversion, sample-exact tests against reference renders, `audio.play(spec)`. Docs and a playground page on debuff.jp.
2. `sound` params, overlay rows (play, waveform, sliders, copy), replays and `game_set_param` support.
3. `game_sound` MCP tool, the played-sounds inspect provider, prompt updates, keiko examples.

## Decisions for the maintainer

- **Presets and defaults are creative calls**: which presets ship, what they sound like, and whether templates switch their placeholder sounds to `sfx()`. This ADR proposes the mechanism; the sounds themselves need sign-off.
- **Naming**: full-word field names (proposed) versus ZzFX's short ones. Full words read better in the overlay and to agents; conversion keeps ZzFX compatibility either way.
- **Attribution**: ZzFX is MIT. The generator is a compatible reimplementation, credited in the source and docs; confirm that's the attribution you want.
- **Overlay UI**: how much room sounds get in the tune tab (collapsed rows by default is proposed).

## Consequences

- Games get usable sound effects with no audio files, and they're tunable live, which is debuff's core loop.
- The audio package grows by the generator's size, only for games that use it.
- Sound becomes inspectable data, so agents and tests can reason about it, within the limits of not hearing it.
