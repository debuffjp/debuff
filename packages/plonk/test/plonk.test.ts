import { describe, expect, it } from "vitest";
import { frequency, notes, parse, type Song, sectionSteps, songSteps, stepSeconds } from "../src/index.js";

describe("notes and patterns", () => {
  it("names notes in Hz, with A4 at 440", () => {
    expect(frequency("A4")).toBe(440);
    expect(frequency("A5")).toBe(880);
    expect(frequency("C4")).toBeCloseTo(261.63, 1);
    expect(frequency("C#4")).toBeCloseTo(frequency("Db4")!, 6);
    expect(frequency("H4")).toBeUndefined();
  });

  it("parses notes, chords, hits, rests and holds", () => {
    const steps = parse("C4 - . x | X E4+G4");
    expect(steps).toHaveLength(6);
    expect(steps[0]).toMatchObject({ length: 2 });
    expect(steps[1]).toBeNull();
    expect(steps[2]).toBeNull();
    expect(steps[3]).toMatchObject({ freqs: [0], velocity: 0.7 });
    expect(steps[4]).toMatchObject({ freqs: [0], velocity: 1 });
    expect(steps[5]!.freqs).toHaveLength(2);
  });

  it("says what it can't read", () => {
    expect(() => parse("C4 Q9")).toThrow(/"Q9" isn't a note/);
  });
});

describe("songs", () => {
  const song: Song = {
    bpm: 120,
    instruments: { lead: {}, kick: { wave: "noise" } },
    sections: {
      a: { lead: "C4 . E4 .", kick: "x . . ." },
      b: { lead: "G4 - - - . . . ." },
    },
    order: ["a", "b"],
  };

  it("times steps as sixteenth notes", () => {
    expect(stepSeconds(120)).toBe(0.125);
  });

  it("knows how long sections and songs are", () => {
    expect(sectionSteps(song.sections.a!)).toBe(4);
    expect(songSteps(song)).toBe(12);
  });

  it("lists the notes in a window of steps, in order, looping", () => {
    const first = notes(song, 0, 12);
    expect(first.map((n) => `${n.instrument}@${n.time}`)).toEqual(["lead@0", "kick@0", "lead@0.25", "lead@0.5"]);
    expect(first[3]!.duration).toBe(0.5); // G4 held for four steps
    // The second pass starts 12 steps (1.5 s) later.
    expect(notes(song, 12, 13).map((n) => n.time)).toEqual([1.5, 1.5]);
  });

  it("swings every other step", () => {
    const swung = notes({ ...song, swing: 0.5, sections: { a: { lead: "C4 C4" } }, order: ["a"] }, 0, 2);
    expect(swung.map((n) => n.time)).toEqual([0, 0.125 + 0.0625]);
  });

  it("repeats a short pattern to fill its section", () => {
    const s: Song = { bpm: 120, instruments: { hat: {} }, sections: { a: { hat: "x .", lead: "C4 . . . . . . ." } }, order: ["a"] };
    expect(notes(s, 0, 8).filter((n) => n.instrument === "hat")).toHaveLength(4);
  });
});
