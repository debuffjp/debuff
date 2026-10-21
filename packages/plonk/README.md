# plonk

**Game music made in code.** A song is a few hundred bytes of data, instruments and patterns of notes, synthesized
live with Web Audio. There are no audio files to download, the engine is about 2 kB brotli, and it works with any
engine (or none).

```ts
import { Player, type Song } from "plonk";

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

## Seeing music without hearing it

`notes(song, fromStep, toStep)` returns every note in a window as data (time, instrument, frequency, duration,
velocity), and `player.played` lists the notes it has scheduled. Tests and agents can check a song, or that the right
music is playing, without speakers.
