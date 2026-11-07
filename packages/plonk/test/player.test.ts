import { afterEach, describe, expect, it, vi } from "vitest";
import { Player, type Song } from "../src/index.js";

/** Just enough of Web Audio to drive the player: every node accepts anything and records what started. */
function fakeContext() {
  const started: { type: string; when: number }[] = [];
  const gains: Record<string, unknown>[] = [];
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
      connect: (to: unknown) => {
        n.to = to;
        return to;
      },
      disconnected: false,
      disconnect() {
        n.disconnected = true;
      },
      start: (when: number) => started.push({ type, when }),
      stop() {},
    };
    if (type === "gain") gains.push(n);
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
  /** Per-instrument layer gains: the ones feeding the player's output gain (the first gain it creates). */
  const layers = () => gains.filter((g) => g.to === gains[0]);
  return { ctx: ctx as unknown as AudioContext, started, run, layers };
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

  it("fades out on stop(fade) instead of cutting the instruments off at once", () => {
    vi.useFakeTimers();
    const fake = fakeContext();
    const { ctx, run } = fake;
    const player = new Player({ context: ctx });
    player.play(song);
    const layers = fake.layers(); // one per instrument, created as notes are scheduled
    expect(layers).toHaveLength(2);
    player.stop(2);
    expect(layers.every((g) => !g.disconnected)).toBe(true); // still sounding through the fade
    run(2.5);
    expect(layers.every((g) => g.disconnected)).toBe(true); // let go once it's over
  });

  it("keeps a layer volume set before play()", () => {
    vi.useFakeTimers();
    const fake = fakeContext();
    const { ctx, run } = fake;
    const player = new Player({ context: ctx });
    player.layer("kick", 0, 0); // start with the drums muted
    const [kick] = fake.layers();
    player.play(song);
    run(0.2);
    expect(kick?.disconnected).toBe(false);
    expect(fake.layers()).toHaveLength(2); // kick kept its layer; only lead got a new one
  });

  it("times sfx({ after }) at 120 bpm once the song has stopped, as documented", () => {
    vi.useFakeTimers();
    const { ctx } = fakeContext();
    const player = new Player({ context: ctx });
    player.play({ ...song, bpm: 60 });
    player.stop();
    // 4 steps at 120 bpm: 0.5 s. Before, the stopped song's 60 bpm still applied (1 s).
    expect(player.sfx({ wave: "sine" }, { after: 4, freq: 440 })).toBeCloseTo(0.5);
  });

  it("cuts a fading song when the next one starts", () => {
    vi.useFakeTimers();
    const fake = fakeContext();
    const player = new Player({ context: fake.ctx });
    player.play(song);
    const old = fake.layers();
    player.stop(2);
    player.play(song);
    expect(old.every((g) => g.disconnected)).toBe(true);
  });

  it("rejects an unreadable song in play(), leaving the current song playing", () => {
    vi.useFakeTimers();
    const { ctx } = fakeContext();
    const player = new Player({ context: ctx });
    player.play(song);
    const bad: Song = { ...song, sections: { a: { lead: "C4 ?50" } }, order: ["a"] };
    expect(() => player.play(bad)).toThrow(/in section "a", track "lead"/);
    expect(player.playing).toBe(true);
    player.stop();
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

  it("keeps noise going for as long as its note, past the one-second noise buffer", () => {
    const { ctx } = fakeContext();
    const sources: Record<string, unknown>[] = [];
    const make = ctx.createBufferSource.bind(ctx);
    (ctx as unknown as { createBufferSource: () => unknown }).createBufferSource = () => {
      const n = make() as unknown as Record<string, unknown>;
      sources.push(n);
      return n;
    };
    new Player({ context: ctx }).sfx({ wave: "noise", attack: 1, decay: 2, sustain: 0 }, { freq: 1 });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.loop).toBe(true);
  });

  it("reports where the music is, in steps, through starts, jumps, tempo changes and stops", () => {
    vi.useFakeTimers();
    const { ctx, run } = fakeContext();
    const player = new Player({ context: ctx });
    expect(player.step).toBe(-1);
    player.play(song);
    run(1);
    // 120 bpm: a step every 0.125 s, from just after the start (play() begins 50 ms ahead).
    expect(player.step).toBeCloseTo((ctx.currentTime - 0.05) / 0.125, 5);
    player.play(song, { at: 12 });
    // Step 12 starts 50 ms from now.
    expect(player.step).toBeCloseTo(12 - 0.05 / 0.125, 5);
    run(0.5);
    expect(player.step).toBeCloseTo(12 + (0.5 - 0.05) / 0.125, 0);
    const before = player.step;
    player.tempo(2);
    run(0.5);
    // Twice as fast: 0.5 s is now 8 steps, not 4, and nothing jumped at the switch.
    expect(player.step - before).toBeCloseTo(8, 0);
    player.stop();
    expect(player.step).toBe(-1);
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
