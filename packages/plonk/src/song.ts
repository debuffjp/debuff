// Songs as data, and the pure part of playing them: parsing patterns and turning a song into timed note events. No
// Web Audio here, so all of it runs (and is tested) anywhere.

/** How an instrument sounds. Every field is optional; the defaults make a soft square lead. */
export interface Instrument {
  /** Oscillator shape, or "noise" for drums. */
  wave?: "sine" | "square" | "sawtooth" | "triangle" | "noise";
  /** Envelope, in seconds (sustain is a level, 0-1). */
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  /** Loudness, 0-1. */
  volume?: number;
  /** Shift every note by whole octaves. */
  octave?: number;
  /** A second oscillator this many cents apart, for a fatter, chorused sound. */
  detune?: number;
  /** A low-pass filter: cutoff in Hz, resonance (Q), and how far the cutoff sweeps up at each note's start. */
  filter?: { cutoff: number; q?: number; sweep?: number };
  /** Pitch drops from this many semitones above to the note (kicks, "bloop"s). */
  drop?: number;
  /** Vibrato depth in cents, at 5.5 Hz. */
  vibrato?: number;
  /** How much goes to the echo, 0-1. */
  echo?: number;
}

/** A song: instruments, and tracks of patterns in sections played in order. */
export interface Song {
  /** Beats per minute; each step in a pattern is a sixteenth note. */
  bpm: number;
  /** Delay every other step by this fraction of a step (0-0.5), for a bouncy, swung feel. */
  swing?: number;
  instruments: Record<string, Instrument>;
  /**
   * Patterns per section, per instrument. A pattern is steps separated by spaces: a note ("C4", "Eb5", "F#3"), a
   * chord ("C4+E4+G4"), "x" (hit; "X" for an accented hit) for drums, "." for silence, "-" to hold the step before.
   * "|" is ignored, for marking bars. A shorter pattern repeats to fill the section.
   */
  sections: Record<string, Record<string, string>>;
  /** Section names in the order they play. The song loops back to the start. */
  order: string[];
}

/** One note to play: when (seconds from the start), on what, how high (Hz, or 0 for a drum hit), for how long. */
export interface NoteEvent {
  time: number;
  instrument: string;
  freq: number;
  duration: number;
  /** 0-1: accented hits are louder. */
  velocity: number;
}

const NOTE = /^([A-Ga-g])(#|b)?(-?\d)$/;
const SEMITONE: Record<string, number> = { c: -9, d: -7, e: -5, f: -4, g: -2, a: 0, b: 2 };

/** A note name ("A4", "C#5", "Eb3") as a frequency in Hz, or undefined if it isn't one. A4 is 440 Hz. */
export function frequency(name: string): number | undefined {
  const m = NOTE.exec(name);
  if (!m) return undefined;
  const semis = SEMITONE[m[1]!.toLowerCase()]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
}

/** A step: what starts there (frequencies, or [0] for a hit), its velocity, and how many steps it lasts. */
export interface Step {
  freqs: number[];
  velocity: number;
  length: number;
}

/** Parse a pattern into steps; `null` where nothing starts (rests and held steps). Throws on anything unreadable. */
export function parse(pattern: string): (Step | null)[] {
  const tokens = pattern.split(/\s+/).filter((t) => t && t !== "|");
  const out: (Step | null)[] = [];
  let last: Step | undefined;
  for (const token of tokens) {
    if (token === ".") {
      out.push(null);
      last = undefined;
    } else if (token === "-") {
      if (last) last.length++;
      out.push(null);
    } else if (token === "x" || token === "X") {
      last = { freqs: [0], velocity: token === "X" ? 1 : 0.7, length: 1 };
      out.push(last);
    } else {
      const freqs = token.split("+").map((n) => {
        const f = frequency(n);
        if (f === undefined) throw new Error(`plonk: "${n}" isn't a note (try "C4", "Eb5" or "F#3")`);
        return f;
      });
      last = { freqs, velocity: 0.8, length: 1 };
      out.push(last);
    }
  }
  return out;
}

/** Seconds per step (a sixteenth note). */
export const stepSeconds = (bpm: number) => 60 / bpm / 4;

/** How many steps a section lasts: its longest pattern. */
export function sectionSteps(section: Record<string, string>): number {
  let n = 0;
  for (const p of Object.values(section)) n = Math.max(n, parse(p).length);
  return n;
}

/** Steps in one pass through the whole song. */
export const songSteps = (song: Song) => song.order.reduce((n, name) => n + sectionSteps(song.sections[name] ?? {}), 0);

/**
 * Every note that starts in steps [from, to) of the song (counting from 0, looping through `order` forever), with
 * times in seconds from step 0. The player calls this a little ahead of time; tests and agents can call it to see a
 * song without hearing it.
 */
export function notes(song: Song, from: number, to: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  const step = stepSeconds(song.bpm),
    swing = Math.max(0, Math.min(0.5, song.swing ?? 0)) * step;
  const total = songSteps(song);
  if (total === 0) return out;
  // Where each section starts within one pass.
  const starts: { name: string; at: number; len: number }[] = [];
  let at = 0;
  for (const name of song.order) {
    const len = sectionSteps(song.sections[name] ?? {});
    starts.push({ name, at, len });
    at += len;
  }
  const parsed = new Map<string, (Step | null)[]>();
  const steps = (p: string) => {
    let s = parsed.get(p);
    if (!s) {
      s = parse(p);
      parsed.set(p, s);
    }
    return s;
  };
  for (let i = Math.max(0, Math.floor(from)); i < to; i++) {
    const pass = Math.floor(i / total),
      within = i % total;
    const sec = starts.find((s) => within >= s.at && within < s.at + s.len);
    if (!sec) continue;
    for (const [instrument, pattern] of Object.entries(song.sections[sec.name] ?? {})) {
      const ps = steps(pattern);
      if (!ps.length) continue;
      const s = ps[(within - sec.at) % ps.length];
      if (!s) continue;
      const time = (pass * total + within) * step + (within % 2 === 1 ? swing : 0);
      for (const freq of s.freqs) out.push({ time, instrument, freq, duration: s.length * step, velocity: s.velocity });
    }
  }
  return out;
}
