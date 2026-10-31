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
  /** How much goes to the reverb, 0-1. */
  reverb?: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
}

/** A track in a section: one pattern, or several that take turns each time the section plays (for fills). */
export type Track = string | string[];

/** A song: instruments, and tracks of patterns in sections played in order. */
export interface Song {
  /** Beats per minute; each step in a pattern is a sixteenth note. */
  bpm: number;
  /** Delay every other step by this fraction of a step (0-0.5), for a bouncy, swung feel. */
  swing?: number;
  /** The key, for scale degrees (`^1`...) and in-key sound effects: "C major", "A minor", "D dorian"... */
  key?: string;
  /** Shift the whole song by this many semitones. */
  transpose?: number;
  instruments: Record<string, Instrument>;
  /**
   * Patterns per section, per instrument. A pattern is steps separated by spaces. See `parse` for what a step can be.
   * A shorter pattern repeats to fill the section; a list of patterns takes turns, one per time the section plays.
   */
  sections: Record<string, Record<string, Track>>;
  /** Section names in the order they play. The song loops back to the start. */
  order: string[];
}

/** One note to play: when (seconds from the start), on what, how high (Hz, or 0 for a drum hit), for how long. */
export interface NoteEvent {
  time: number;
  instrument: string;
  freq: number;
  duration: number;
  /** 0-1: accents are louder, ghost notes quieter. */
  velocity: number;
}

// ---- pitch ------------------------------------------------------------------------------------------------

const NOTE = /^([A-Ga-g])(#|b)?(-?\d)$/;
const SEMITONE: Record<string, number> = { c: -9, d: -7, e: -5, f: -4, g: -2, a: 0, b: 2 };
const LETTER = /^([A-Ga-g])(#|b)?/;

/** Semitones from A4 to a note name, or undefined. */
function semitones(name: string): number | undefined {
  const m = NOTE.exec(name);
  if (!m) return undefined;
  return SEMITONE[m[1]!.toLowerCase()]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) - 4) * 12;
}

const hz = (fromA4: number) => 440 * 2 ** (fromA4 / 12);

/** A note name ("A4", "C#5", "Eb3") as a frequency in Hz, or undefined if it isn't one. A4 is 440 Hz. */
export function frequency(name: string): number | undefined {
  const s = semitones(name);
  return s === undefined ? undefined : hz(s);
}

/** The scales `key` understands, as semitones above the root. */
export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  "minor pentatonic": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

/** A key ("C major", "F# minor pentatonic") as its root (semitones from A, in octave 4's C-to-B) and scale. */
export function parseKey(key = "C major"): { root: number; scale: number[] } {
  const [rootName = "C", ...rest] = key.trim().split(/\s+/);
  const m = LETTER.exec(rootName);
  const scale = SCALES[(rest.join(" ") || "major").toLowerCase()];
  if (!m || !scale) throw new Error(`plonk: "${key}" isn't a key (try "C major", "A minor" or "D dorian")`);
  const root = SEMITONE[m[1]!.toLowerCase()]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return { root, scale };
}

/**
 * The frequency of scale degree `n` (1 = the root; 8 = the root an octave up; 0 and below go down) of `key`, in
 * `octave` (4 by default, the octave of middle C). Sound effects use this to land in the song's key.
 */
export function degree(key: string | undefined, n: number, octave = 4): number {
  const { root, scale } = parseKey(key);
  const i = n - 1;
  const len = scale.length;
  const oct = Math.floor(i / len);
  const within = ((i % len) + len) % len;
  return hz(root + scale[within]! + (octave - 4 + oct) * 12);
}

const CHORDS: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14],
  "9": [0, 4, 7, 10, 14],
};
const CHORD = /^([A-G])(#|b)?(maj7|m7|m6|dim|aug|sus2|sus4|add9|m|7|6|9)?@(-?\d)$/;

/** A chord name with an octave ("Am7@3", "Cmaj7@4", "G@3") as frequencies, or undefined. */
export function chord(name: string): number[] | undefined {
  const m = CHORD.exec(name);
  if (!m) return undefined;
  const root = SEMITONE[m[1]!.toLowerCase()]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[4]) - 4) * 12;
  return CHORDS[m[3] ?? ""]!.map((s) => hz(root + s));
}

// ---- patterns -----------------------------------------------------------------------------------------------

/** A step: what starts there (frequencies, or [0] for a hit), its velocity, chance to play, and length in steps. */
export interface Step {
  freqs: number[];
  velocity: number;
  /** 0-1: the step plays this often (seeded, so the same song always plays the same way). */
  chance: number;
  length: number;
}

const MODS = /([!_]|\?\d*)+$/;

/**
 * Parse a pattern into steps; `null` where nothing starts (rests and held steps). Throws on anything unreadable.
 *
 * A step is one of:
 * - a note: "C4", "Eb5", "F#3"
 * - a chord: notes joined with "+" ("C4+E4+G4"), or a chord name with an octave ("Am7@3", "Cmaj7@4", "G@3")
 * - a scale degree of the song's key: "^1" (the root), "^3", "^5@5" (in octave 5; octave 4 by default)
 * - a hit, for drums: "x" ("X" is an accented hit)
 * - "." silence, "-" hold the step before, "|" ignored (mark bars)
 *
 * Any note, chord or hit can end with "!" (accent), "_" (ghost: quiet), and "?" (plays half the time) or "?30" (30%).
 */
export function parse(pattern: string, key?: string): (Step | null)[] {
  const tokens = pattern.split(/\s+/).filter((t) => t && t !== "|");
  const out: (Step | null)[] = [];
  let last: Step | undefined;
  for (const token of tokens) {
    if (token === ".") {
      out.push(null);
      last = undefined;
      continue;
    }
    if (token === "-") {
      if (last) last.length++;
      out.push(null);
      continue;
    }
    const mods = MODS.exec(token)?.[0] ?? "";
    const body = mods ? token.slice(0, -mods.length) : token;
    const at = `step ${out.length + 1} of "${pattern}"`;
    if (!body) throw new Error(`plonk: "${token}" at ${at} has no note before its "${mods[0]}" (try "C4${mods}")`);
    let velocity = 0.8;
    let freqs: number[];
    if (body === "x" || body === "X") {
      freqs = [0];
      velocity = body === "X" ? 1 : 0.7;
    } else if (body.startsWith("^")) {
      const [n, oct] = body.slice(1).split("@");
      if (!n || Number.isNaN(Number(n))) throw new Error(`plonk: "${token}" at ${at} isn't a scale degree (try "^1", "^5" or "^3@5")`);
      freqs = [degree(key, Number(n), oct === undefined ? 4 : Number(oct))];
    } else {
      freqs =
        chord(body) ??
        body.split("+").map((n) => {
          const f = frequency(n);
          if (f === undefined) throw new Error(`plonk: "${n}" at ${at} isn't a note (try "C4", "Eb5", "F#3", "Am7@3" or "^3")`);
          return f;
        });
    }
    if (mods.includes("!")) velocity = 1;
    if (mods.includes("_")) velocity = 0.4;
    const q = /\?(\d*)/.exec(mods);
    const chance = q ? (q[1] ? Number(q[1]) / 100 : 0.5) : 1;
    last = { freqs, velocity, chance, length: 1 };
    out.push(last);
  }
  return out;
}

// ---- timing -------------------------------------------------------------------------------------------------

/** Seconds per step (a sixteenth note). */
export const stepSeconds = (bpm: number) => 60 / bpm / 4;

const variants = (track: Track) => (Array.isArray(track) ? track : [track]);

/** How many steps a section lasts: its longest pattern. */
export function sectionSteps(section: Record<string, Track>): number {
  let n = 0;
  for (const t of Object.values(section)) for (const p of variants(t)) n = Math.max(n, parse(p).length);
  return n;
}

/** Steps in one pass through the whole song. */
export const songSteps = (song: Song) => layout(song).total;

/** A seeded number in [0, 1) for a step, so chances come out the same every time the song plays. */
function seeded(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const hashName = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

interface Layout {
  total: number;
  /** Where each section starts within one pass, and how many times it already played earlier in that pass. */
  starts: { name: string; at: number; len: number; seen: number }[];
  /** How many times each section plays per pass. */
  perPass: Map<string, number>;
  steps: (pattern: string) => (Step | null)[];
}

/**
 * A song's parsed layout, worked out once per song object: the player asks for notes many times a second, and
 * re-parsing every pattern each time adds up. (Songs are treated as unchanging once played; pass a new object to
 * change one.)
 */
const layouts = new WeakMap<Song, Layout>();
function layout(song: Song): Layout {
  let l = layouts.get(song);
  if (l) return l;
  const parsed = new Map<string, (Step | null)[]>();
  const steps = (p: string) => {
    let s = parsed.get(p);
    if (!s) {
      s = parse(p, song.key);
      parsed.set(p, s);
    }
    return s;
  };
  const starts: Layout["starts"] = [];
  const perPass = new Map<string, number>();
  let at = 0;
  for (const name of song.order) {
    let len = 0;
    for (const [instrument, t] of Object.entries(song.sections[name] ?? {}))
      for (const p of variants(t)) {
        try {
          len = Math.max(len, steps(p).length);
        } catch (e) {
          throw new Error(`${(e as Error).message}, in section "${name}", track "${instrument}"`);
        }
      }
    const seen = perPass.get(name) ?? 0;
    perPass.set(name, seen + 1);
    starts.push({ name, at, len, seen });
    at += len;
  }
  l = { total: at, starts, perPass, steps };
  layouts.set(song, l);
  return l;
}

/**
 * Every note that starts in steps [from, to) of the song (counting from 0, looping through `order` forever), with
 * times in seconds from step 0. The player calls this a little ahead of time; tests and agents can call it to see a
 * song without hearing it.
 */
export function notes(song: Song, from: number, to: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  const step = stepSeconds(song.bpm),
    swing = Math.max(0, Math.min(0.5, song.swing ?? 0)) * step;
  const { total, starts, perPass, steps } = layout(song);
  if (total === 0) return out;
  const shift = 2 ** ((song.transpose ?? 0) / 12);
  for (let i = Math.max(0, Math.floor(from)); i < to; i++) {
    const pass = Math.floor(i / total),
      within = i % total;
    const sec = starts.find((s) => within >= s.at && within < s.at + s.len);
    if (!sec) continue;
    // Which time this section is playing, counting from the very start: picks the variant.
    const occurrence = pass * (perPass.get(sec.name) ?? 1) + sec.seen;
    for (const [instrument, track] of Object.entries(song.sections[sec.name] ?? {})) {
      const options = variants(track);
      const ps = steps(options[occurrence % options.length]!);
      if (!ps.length) continue;
      const s = ps[(within - sec.at) % ps.length];
      if (!s) continue;
      if (s.chance < 1 && seeded(pass, within, hashName(instrument)) >= s.chance) continue;
      const time = (pass * total + within) * step + (within % 2 === 1 ? swing : 0);
      for (const freq of s.freqs) out.push({ time, instrument, freq: freq * shift, duration: s.length * step, velocity: s.velocity });
    }
  }
  return out;
}
