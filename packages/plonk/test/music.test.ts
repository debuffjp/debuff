import { describe, expect, it } from "vitest";
import { analyse, chord, degree, frequency, loudness, notes, parse, parseKey, type Song } from "../src/index.js";

describe("keys, degrees and chords", () => {
  it("knows keys and their scales", () => {
    expect(parseKey("A minor").scale).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(() => parseKey("H lydian")).toThrow(/isn't a key/);
  });

  it("turns scale degrees into notes of the key", () => {
    expect(degree("C major", 1)).toBeCloseTo(frequency("C4")!, 6);
    expect(degree("C major", 3)).toBeCloseTo(frequency("E4")!, 6);
    expect(degree("A minor", 3)).toBeCloseTo(frequency("C5")!, 6); // A B C
    expect(degree("C major", 8)).toBeCloseTo(frequency("C5")!, 6); // an octave up
    expect(degree("C major", 0)).toBeCloseTo(frequency("B3")!, 6); // one below the root
  });

  it("names chords", () => {
    expect(chord("Am7@3")!.map((f) => Math.round(f))).toEqual([220, 262, 330, 392]);
    expect(chord("G@3")).toHaveLength(3);
    expect(chord("A4")).toBeUndefined(); // a note, not a chord
  });
});

describe("expressive steps", () => {
  it("reads degrees, chord names, accents, ghosts and chances", () => {
    const [d, c, acc, ghost, half, rare] = parse("^5@5 Cmaj7@4 C5! C5_ x? x?20", "C major");
    expect(d!.freqs[0]).toBeCloseTo(frequency("G5")!, 6);
    expect(c!.freqs).toHaveLength(4);
    expect(acc!.velocity).toBe(1);
    expect(ghost!.velocity).toBe(0.4);
    expect(half!.chance).toBe(0.5);
    expect(rare!.chance).toBeCloseTo(0.2);
  });

  it("plays chancy steps about as often as asked, the same way every time", () => {
    const song: Song = { bpm: 120, instruments: { hat: {} }, sections: { a: { hat: "x?25" } }, order: ["a"] };
    const a = notes(song, 0, 400).length,
      b = notes(song, 0, 400).length;
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(70);
    expect(a).toBeLessThan(130);
  });

  it("takes turns between a track's variants, for fills", () => {
    const song: Song = {
      bpm: 120,
      instruments: { kick: {} },
      sections: { a: { kick: ["x . . .", "x x x x"] } },
      order: ["a", "a"],
    };
    expect(notes(song, 0, 4)).toHaveLength(1);
    expect(notes(song, 4, 8)).toHaveLength(4); // the second time round: the fill
    expect(notes(song, 8, 12)).toHaveLength(1); // the song loops: back to the first
  });

  it("transposes the whole song", () => {
    const song: Song = { bpm: 120, transpose: 12, instruments: { lead: {} }, sections: { a: { lead: "A4" } }, order: ["a"] };
    expect(notes(song, 0, 1)[0]!.freq).toBeCloseTo(880, 6);
  });
});

describe("measuring audio", () => {
  const rate = 48000;
  const sine = (hz: number, amp: number, seconds: number) =>
    Float32Array.from({ length: rate * seconds }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

  it("reads the BS.1770 reference: a full-scale 1 kHz sine in one channel is -3.01 LUFS", () => {
    expect(loudness([sine(1000, 1, 3)], rate)).toBeCloseTo(-3.01, 1);
  });

  it("counts peaks and clipping", () => {
    const a = analyse([sine(440, 0.5, 1)], rate);
    expect(a.peakDb).toBeCloseTo(-6.02, 1);
    expect(a.clipped).toBe(0);
    expect(analyse([sine(440, 1.2, 1)], rate).clipped).toBeGreaterThan(0);
  });

  it("splits the spectrum into lows, mids and highs", () => {
    expect(analyse([sine(80, 0.5, 1)], rate).bands.low).toBeGreaterThan(0.8);
    expect(analyse([sine(9000, 0.5, 1)], rate).bands.high).toBeGreaterThan(0.6);
  });

  it("measures silence", () => {
    const quiet = new Float32Array(rate);
    expect(analyse([quiet], rate).silence).toBe(1);
  });
});
