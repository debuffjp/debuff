---
name: plonk
description: Use when a web game needs music, a soundtrack, a theme, background music or a jingle, or the user asks to compose, edit or tweak game music, especially when the game draws its art in code or must stay small (Poki, CrazyGames, game jams). plonk makes music in code: songs are small text patterns synthesized live with Web Audio, under 4 kB brotli, any engine.
---

# Writing game music with plonk

plonk plays songs written as data: instruments plus patterns of sixteenth-note steps, synthesized live with Web Audio.
No audio files. The engine is under 4 kB brotli; a song is a few hundred bytes.

Docs: https://debuff.jp/plonk/ · Notation: https://debuff.jp/plonk/songs · Playground: https://debuff.jp/plonk/playground

## Set up

```bash
npm install plonkjs
```

```ts
import { Player, type Song } from "plonkjs";
const player = new Player(); // or new Player({ context, destination }) to share an engine's audio context and bus
player.play(song, { fade: 1 });
```

In a debuff game: `new Player({ context: audio.ctx, destination: audio.bus("music") })`, so the mute covers music.

## The notation

Steps separated by spaces; each is a sixteenth note (4 per beat):

- `C4`, `Eb5`, `F#3`: a note (A4 = 440 Hz). `C4+E4+G4` or `Am7@3`, `Cmaj7@4`, `G@3`: a chord.
- `^1`, `^5`, `^3@5`: a scale degree of the song's `key` (prefer these: the melody always fits the key).
- Endings on any note, chord or hit: `!` accent, `_` ghost (quiet), `?` half the time, `?30` 30% (seeded).
- `x`: a drum hit; `X`: an accented hit.
- `.`: silence. `-`: hold the step before. `|`: ignored, for marking bars.

A song: `{ bpm, swing?, key?, transpose?, instruments, sections: { name: { instrument: pattern | [variants] } }, order }`.
A section lasts as long as its longest pattern; shorter ones repeat (a 4-step drum loop under a 16-step melody). A
list of patterns takes turns each time the section plays (fills). The song loops. Keys: "C major", "A minor",
"D dorian", "E phrygian", "F lydian", "G mixolydian", "C pentatonic", "A minor pentatonic", "A blues".

## Instrument recipes

```ts
lead: { wave: "square", decay: 0.14, sustain: 0.35, volume: 0.13, echo: 0.28, vibrato: 6 },
bass: { wave: "sawtooth", octave: -1, decay: 0.18, sustain: 0.4, volume: 0.22, filter: { cutoff: 380, q: 9, sweep: 1400 } },
pad: { wave: "triangle", attack: 0.15, decay: 0.4, sustain: 0.5, release: 0.4, volume: 0.06, detune: 8 },
kick: { wave: "sine", drop: 24, decay: 0.12, sustain: 0, volume: 0.5 },
snare: { wave: "noise", decay: 0.08, sustain: 0, volume: 0.12, filter: { cutoff: 2200, q: 3 } },
hat: { wave: "noise", decay: 0.03, sustain: 0, volume: 0.08, filter: { cutoff: 9000 } },
```

Fields: `wave` (sine, square, sawtooth, triangle, noise), `attack`/`decay`/`sustain`/`release`, `volume`, `octave`,
`detune` (cents, second oscillator), `filter` `{ cutoff, q, sweep }`, `drop` (semitones, pitch falls into the note),
`vibrato` (cents), `echo` and `reverb` (0-1 sends), `pan` (-1 to 1). A master compressor and limiter stop clipping,
but balance is still yours: check it with `mix()` (below).

## Writing a good game theme

- Keep it short and loopable: 2 to 4 sections of 4 bars (64 steps each at most). Players hear it for minutes.
- A memorable lead over a simple bass that follows the chord roots; drums mostly on the beat (`x . . .`), hats off it.
- Make it react instead of writing more songs: `player.tempo(1.12)` when time runs low, `player.layer("kick", 0)` on
  menus, then back to 1 in play.
- Music is a creative call: write a draft, describe what it should feel like, and let the human listen and decide.

## Sound effects in the song's key

```ts
const POP = { wave: "sine", drop: 7, decay: 0.12, sustain: 0, volume: 0.3 };
player.sfx(POP, { degree: [1, 3, 5, 8, 10][combo - 1], octave: 5 }); // combos climb the song's arpeggio
player.sfx(BELL, { degree: 1, quantize: "beat", after: 2 }); // celebrations land on the beat
```

Quantize celebrations and stingers; never the player's own taps (feedback must be instant).

## Check a mix without hearing it

In a browser (it renders offline, faster than real time):

```ts
import { mix } from "plonkjs";
const report = await mix(song, 20);
// report.song.lufs (aim for about -16), report.song.clipped (must be 0), report.song.bands (low/mid/high shares),
// report.tracks[name].belowMix (LU under the mix: lead and bass 0-5, pads 3-8, drums 10-15),
// report.warnings: plain words, e.g. "hat: buried (32 LU under the mix); raise its volume". Fix every warning.
```

Iterate: change volumes, run `mix()` again, until there are no warnings and the balance reads right. Then hand it to a
person to listen: numbers can't judge a melody.

## Check a song without hearing it

```ts
import { notes, parse } from "plonkjs";
parse("C5 . E5 G5"); // throws on an unreadable step, naming it
notes(song, 0, 64); // every note in steps [0, 64): { time, instrument, freq, duration, velocity }
```

Use `notes()` to confirm the structure you meant (which instruments play in which section, lengths, that the drums
drop out where intended). `player.played` lists what a running player scheduled.
