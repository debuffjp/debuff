/**
 * Time and randomness under the test's control, for games that run on `requestAnimationFrame`.
 *
 * While a game is booted, `requestAnimationFrame` queues instead of firing, `performance.now()` and
 * `Date.now()` return virtual time that only moves when the test steps, and `Math.random()` is seeded.
 * Stepping advances time by one frame and runs the queued frame callbacks, exactly as a browser would,
 * so engines with their own loop (Phaser, PixiJS's ticker, KAPLAY, hand-written loops) play
 * deterministically without any changes.
 */
export class VirtualClock {
  /** Frames played since the game booted. */
  tick = 0;
  /** Virtual milliseconds since the game booted. */
  ms = 0;
  readonly stepMs: number;
  private readonly frames = new Map<number, FrameRequestCallback>();
  private nextId = 1;
  private readonly epoch: number;
  private readonly random: () => number;
  private restore: (() => void) | undefined;

  constructor(options: { fps?: number; seed?: number; epoch?: number } = {}) {
    this.stepMs = 1000 / (options.fps ?? 60);
    this.random = mulberry32(options.seed ?? 1);
    // A fixed date by default, so code that formats dates or seeds from the clock behaves the same every run.
    this.epoch = options.epoch ?? Date.UTC(2026, 0, 1);
  }

  readonly requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = this.nextId++;
    this.frames.set(id, callback);
    return id;
  };

  readonly cancelAnimationFrame = (id: number): void => {
    this.frames.delete(id);
  };

  /** Advance `steps` frames: move time forward and run the frame callbacks queued for each. */
  advance(steps: number): void {
    for (let i = 0; i < steps; i++) {
      this.ms += this.stepMs;
      const due = [...this.frames.values()];
      this.frames.clear();
      for (const callback of due) callback(this.ms);
      // Like debuff's clock, a frame counts once it completes, so a crash reports the frame that threw.
      this.tick++;
    }
  }

  /** Point `performance.now`, `Date.now` and `Math.random` at this clock until {@link uninstall}. */
  install(): void {
    if (this.restore) return;
    const perf = globalThis.performance;
    const realNow = perf.now;
    const realDateNow = Date.now;
    const realRandom = Math.random;
    perf.now = () => this.ms;
    Date.now = () => this.epoch + Math.floor(this.ms);
    Math.random = this.random;
    this.restore = () => {
      perf.now = realNow;
      Date.now = realDateNow;
      Math.random = realRandom;
    };
  }

  uninstall(): void {
    this.restore?.();
    this.restore = undefined;
  }
}

/** A small, fast seeded PRNG (mulberry32): the same seed always gives the same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Node's own clock, captured before any game replaces it. The runner measures real time with this. */
export const realNow: () => number = performance.now.bind(performance);
