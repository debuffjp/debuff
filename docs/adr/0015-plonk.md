# ADR 0015: plonk, music made in code

- Status: accepted
- Date: 2026-10-21

## Context

Music is usually the biggest download in a small web game: one compressed loop is 300 kB to 1 MB, often more than
all the game's code. Squish-style games draw all their art in code to stay tiny and tweakable; their music should be
able to work the same way. gloop, the first full dogfooding game for Poki, had only synth beeps.

ADR 0010 covers sound **effects** (a ZzFX-style generator in `@debuffjp/audio`). Music is a different shape: notes over
time, layers, tempo, looping. It needs a sequencer, not a one-shot renderer.

## Decision

- A standalone, engine-agnostic package, **plonk** (like keiko and myaku): no dependencies, Web Audio only, usable
  from any engine. Games that don't import it pay nothing.
- Songs are data: instruments (oscillator or noise, envelope, filter with sweep, detune, pitch drop, vibrato, echo)
  and string patterns of sixteenth-note steps, arranged in sections. Human-writable and agent-writable.
- The pure part (`parse`, `notes`) has no Web Audio, so songs can be tested and inspected anywhere. The `Player`
  schedules notes ahead on the audio clock, not on frames, so timing holds when a frame drops.
- Games make music react through `tempo()` (no jump) and `layer()` (fade a track in or out).
- `@debuffjp/audio` gains `bus(name)` so plonk plays through a game's music bus and shares its mute.

## Consequences

- Music costs a few kB of engine (2 kB at 0.1; 3.7 kB brotli at 0.2, with the master bus, reverb and `sfx`) plus a few hundred bytes per song, and starts instantly.
- Composition is a creative call: plonk is the instrument; songs need the human's ear.
- Sounding good is part of the package, not left to taste alone: a master compressor and limiter, reverb and pan,
  keys, scale degrees and chord names, seeded variation, sound effects in the song's key (`sfx`), and measurement
  without ears (`render`, `analyse`, `mix`: BS.1770 loudness, clipping, spectrum, per-track balance). The measuring
  code tree-shakes away from games that don't import it.
- Later: sounds-as-params integration (ADR 0010's overlay rows for songs), a pattern editor in the dev overlay, and
  a `game_song` MCP tool that shows a song as a piano roll image for agents.
