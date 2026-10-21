# plonk

**Game music made in code.** A song is a few hundred bytes of data, instruments and patterns of notes, synthesized
live with Web Audio. There are no audio files to download, the engine is about 2 kB brotli, and it works with any
engine (or none).

```ts
import { Player, type Song } from "plonkjs";

const theme: Song = {
  bpm: 112,
  swing: 0.15,
  instruments: {
    lead: { wave: "square", decay: 0.15, sustain: 0.3, volume: 0.25, echo: 0.3 },
    bass: { wave: "triangle", octave: -1, volume: 0.4 },
    kick: { wave: "sine", drop: 24, decay: 0.12, sustain: 0, volume: 0.6 },
    hat: { wave: "noise", decay: 0.03, sustain: 0, volume: 0.12, filter: { cutoff: 9000 } },
  },
  sections: {
    a: {
      lead: "C5 . E5 G5 | . E5 C5 . | D5 . F5 A5 | G5 - - .",
      bass: "C3 . . . | C3 . G2 . | D3 . . . | G2 . . .",
      kick: "x . . . x . . .",
      hat: ". . x . . . x .",
    },
  },
  order: ["a", "a"],
};

const player = new Player();
player.play(theme, { fade: 1 });
player.tempo(1.2); // hurry up: moves are running out
const beat = Math.floor(player.step / 4); // where the music is, for animation in time with it
player.layer("hat", 0); // drop the hats
player.stop(1); // fade out over a second
```

## Patterns

Each step is a sixteenth note. Steps are separated by spaces:

| Step | Means |
| --- | --- |
| `C4`, `Eb5`, `F#3` | a note (A4 = 440 Hz) |
| `C4+E4+G4` | a chord |
| `x`, `X` | a hit (for drums); `X` is accented |
| `.` | silence |
| `-` | hold the step before |
| `\|` | ignored: mark bars however you like |

A shorter pattern repeats to fill its section, so `"x . . ."` is a four-on-the-floor kick under a 16-step melody.

## Instruments

All fields are optional: `wave` (`sine`, `square`, `sawtooth`, `triangle` or `noise`), envelope (`attack`, `decay`,
`sustain`, `release`), `volume`, `octave`, `detune` (a second oscillator, in cents, for a fatter sound), `filter`
(`{ cutoff, q, sweep }`, a low-pass with an optional sweep at each note: squelchy basses), `drop` (pitch falls from
this many semitones above: kicks and bloops), `vibrato` (cents) and `echo` (0-1, a tempo-synced echo).

## With a game engine

Pass the engine's audio context and a bus, so the music shares its volume and mute. With debuff:

```ts
const player = new Player({ context: audio.ctx, destination: audio.bus("music") });
```

## Sounding good

- **Keys and degrees:** give a song a `key` ("A minor") and write `^1 ^3 ^5`; named chords (`Am7@3`) work too.
- **Variation:** `!` accents, `_` ghost notes, `?` / `?30` chances (seeded), and tracks that take turns between
  patterns, for fills.
- **Space:** `reverb`, `echo` and `pan` per instrument; a master compressor and limiter so the mix never clips.
- **Sound effects that belong to the music:** `player.sfx(instrument, { degree, quantize: "beat" })` plays in the
  song's key, on its beat if you like.

## Checking a mix without speakers

`await mix(song)` (in a browser) renders the song offline and reports its loudness in LUFS (ITU-R BS.1770), peaks and
clipping, spectrum balance, each track's level under the mix, and warnings in plain words ("hat: buried"). Aim for
about -16 LUFS with no warnings, then let a person listen.

## Seeing music without hearing it

`notes(song, fromStep, toStep)` returns every note in a window as data (time, instrument, frequency, duration,
velocity), and `player.played` lists the notes it has scheduled. Tests and agents can check a song, or that the right
music is playing, without speakers.
