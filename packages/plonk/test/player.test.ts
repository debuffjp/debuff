import { afterEach, describe, expect, it, vi } from "vitest";
import { Player, type Song } from "../src/index.js";

/** Just enough of Web Audio to drive the player: every node accepts anything and records what started. */
function fakeContext() {
  const started: { type: string; when: number }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (type: string): Record<string, unknown> => {
    const n: Record<string, unknown> = {
      gain: param(),
      frequency: param(),
      detune: param(),
      Q: param(),
      delayTime: param(),
      type: "",
      buffer: null,
      connect: (to: unknown) => to,
      disconnect() {},
      start: (when: number) => started.push({ type, when }),
      stop() {},
    };
    return n;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: node("destination"),
    resume: async () => {},
    createGain: () => node("gain"),
    createDelay: () => node("delay"),
    createBiquadFilter: () => node("filter"),
    createOscillator: () => node("osc"),
    createDynamicsCompressor: () => ({
      ...node("comp"),
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    }),
    createConvolver: () => node("convolver"),
    createStereoPanner: () => ({ ...node("pan"), pan: param() }),
    createBufferSource: () => node("noise"),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  };
  /** Run the audio clock and the scheduler together, in 40 ms ticks, like a real page. */
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.04) {
      ctx.currentTime += 0.04;
      vi.advanceTimersByTime(40);
    }
  };
  return { ctx: ctx as unknown as AudioContext, started, run };
}

const song: Song = {
  bpm: 120,
  instruments: { lead: { wave: "square", detune: 7 }, kick: { wave: "noise" } },
  sections: { a: { lead: "C4 . E4 . G4 . E4 .", kick: "x . . . x . . ." } },
  order: ["a"],
};

describe("Player", () => {
  afterEach(() => vi.useRealTimers());

  it("schedules notes a little ahead on the audio clock, and keeps going", () => {
    vi.useFakeTimers();
    const { ctx, started, run } = fakeContext();
    const player = new Player({ context: ctx });
    player.play(song);
    expect(player.playing).toBe(true);
    // Straight away: the first notes, within the lookahead.
    expect(player.played.map((n) => n.instrument)).toEqual(["lead", "kick"]);
    expect(started.filter((s) => s.type === "osc")).toHaveLength(2); // detuned: two oscillators per note
    // A second later (8 steps at 120 bpm: one pass, 6 notes), it has gone round the loop and kept going.
    run(1);
    expect(player.played.length).toBeGreaterThan(6);
    player.stop();
    expect(player.playing).toBe(false);
  });

  it("plays sound effects in the song's key, on the beat when asked", () => {
    vi.useFakeTimers();
    const { ctx, run } = fakeContext();
    const player = new Player({ context: ctx });
    player.play({ ...song, key: "A minor" });
    run(0.3);
    const now = ctx.currentTime;
    const at = player.sfx({ wave: "sine" }, { degree: 3, quantize: "beat" });
    // 120 bpm: a beat every 0.5 s, from the song's start (just after time 0).
    expect(at).toBeGreaterThanOrEqual(now);
    expect(at - 0.05).toBeCloseTo(0.5, 1);
    expect(player.played.at(-1)!.freq).toBeCloseTo(523.25, 1); // C5: the 3rd of A minor
    player.stop();
  });

  it("speeds up without a jump", () => {
    vi.useFakeTimers();
    const { ctx, run } = fakeContext();
    const player = new Player({ context: ctx });
    player.play(song);
    run(2);
    const slow = player.played.length;
    player.tempo(2);
    run(2);
    // Twice the tempo: the next two seconds hold about twice the notes.
    const fast = player.played.length - slow;
    expect(fast).toBeGreaterThan(slow * 1.6);
    player.stop();
  });
});
