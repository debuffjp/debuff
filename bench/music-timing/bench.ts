// Music timing under main-thread load: plonk (notes scheduled ahead on the audio clock) against a frame-loop
// sequencer (notes started from requestAnimationFrame, the way many games trigger sounds). Both play the same
// steady sixteenth notes; every note's real start time is read from the audio clock and compared with where it
// should be. Results go to window.__results for run.mjs.
import { Player, type Song } from "../../packages/plonk/src/index.js";

const BPM = 120;
const STEP = 60 / BPM / 4; // 0.125 s
const SECONDS = 12;

const song: Song = {
  bpm: BPM,
  instruments: { tick: { wave: "square", decay: 0.02, sustain: 0, release: 0.01, volume: 0.05 } },
  sections: { a: { tick: "x x x x x x x x x x x x x x x x" } },
  order: ["a"],
};

/** Every oscillator start, as the moment it actually sounds: `when`, or now if `when` is already past. */
let starts: number[] = [];
const start = OscillatorNode.prototype.start;
OscillatorNode.prototype.start = function (this: OscillatorNode, when = 0) {
  starts.push(Math.max(when, this.context.currentTime));
  return start.call(this, when);
};

/** Block the main thread, like a garbage-collection pause, a heavy frame or loading a level. */
function busy(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // spin
  }
}

const CONDITIONS: Record<string, { every: number; block: number } | null> = {
  idle: null,
  jank: { every: 500, block: 60 }, // a 60 ms hitch twice a second
  stall: { every: 2000, block: 300 }, // a 300 ms freeze every two seconds
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Timing errors of the notes that played, and how many steps came due without one. */
interface Run {
  errors: number[];
  dropped: number;
  /** Seconds from the first note to each dropped step. */
  droppedAt: number[];
}

async function plonk(ctx: AudioContext): Promise<Run> {
  const player = new Player({ context: ctx });
  starts = [];
  player.play(song);
  await wait(SECONDS * 1000);
  player.stop();
  const s = [...starts].sort((a, b) => a - b);
  // plonk never plays a note more than 10 ms late (it skips it instead), so each note's step is the nearest one.
  const slot = (t: number) => Math.round((t - s[0]!) / STEP);
  const errors = s.map((t) => t - (s[0]! + slot(t) * STEP));
  const played = new Set(s.map(slot));
  const droppedAt: number[] = [];
  for (let k = 0; k <= slot(s.at(-1)!); k++) if (!played.has(k)) droppedAt.push(+(k * STEP).toFixed(3));
  return { errors, dropped: droppedAt.length, droppedAt };
}

async function frameLoop(ctx: AudioContext): Promise<Run> {
  starts = [];
  const t0 = ctx.currentTime + 0.05;
  let k = 0;
  let running = true;
  const frame = () => {
    const now = ctx.currentTime;
    // Every step that has come due since the last frame starts now (late ones catch up in a burst).
    while (t0 + k * STEP <= now) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      osc.type = "square";
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.03);
      k++;
    }
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  await wait(SECONDS * 1000);
  running = false;
  // starts[k] is when note k sounded; it was due at t0 + k * STEP.
  // It plays every note, late ones in a burst, so none is dropped.
  return { errors: starts.map((t, i) => t - (t0 + i * STEP)), dropped: 0, droppedAt: [] };
}

function summary({ errors, dropped, droppedAt }: Run) {
  const ms = errors.map((e) => Math.abs(e) * 1000).sort((a, b) => a - b);
  const due = ms.length + dropped;
  const at = (q: number) => +(ms[Math.min(ms.length - 1, Math.floor(q * ms.length))] ?? 0).toFixed(2);
  return {
    notes: ms.length,
    dropped,
    droppedShare: +(dropped / due).toFixed(4),
    droppedAt,
    medianMs: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: +(ms.at(-1) ?? 0).toFixed(2),
    over10ms: +(ms.filter((m) => m > 10).length / ms.length).toFixed(4),
    over30ms: +(ms.filter((m) => m > 30).length / ms.length).toFixed(4),
  };
}

const ROUNDS = 5;

async function main() {
  const ctx = new AudioContext();
  await ctx.resume();
  // Rounds interleave conditions and engines, so drift on the machine spreads over all of them.
  const rounds: Record<string, Record<string, ReturnType<typeof summary> & { errorsMs: number[] }>>[] = [];
  for (let round = 0; round < ROUNDS; round++) rounds.push(await once(ctx));
  (window as unknown as { __results: unknown }).__results = {
    seconds: SECONDS,
    bpm: BPM,
    rounds: ROUNDS,
    conditions: CONDITIONS,
    results: rounds,
    audio: { sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency },
  };
}

async function once(ctx: AudioContext) {
  const results: Record<string, Record<string, ReturnType<typeof summary> & { errorsMs: number[] }>> = {};
  for (const [name, load] of Object.entries(CONDITIONS)) {
    results[name] = {};
    for (const [engine, run] of [
      ["plonk", plonk],
      ["frame loop", frameLoop],
    ] as const) {
      const timer = load ? setInterval(() => busy(load.block), load.every) : undefined;
      const r = await run(ctx);
      clearInterval(timer);
      await wait(500);
      results[name][engine] = { ...summary(r), errorsMs: r.errors.map((e) => +(e * 1000).toFixed(3)) };
    }
  }
  return results;
}
main().catch((e) => {
  (window as unknown as { __error: string }).__error = String(e);
});
