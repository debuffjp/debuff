/**
 * Time and randomness under the test's control, for games that run on `requestAnimationFrame`.
 *
 * While a game is booted, `requestAnimationFrame` queues instead of firing, `setTimeout` and `setInterval`
 * wait on virtual time, `performance.now()` and `Date.now()` return virtual time that only moves when the
 * test steps, and `Math.random()` is seeded. Stepping advances time by one frame: timers that fall due
 * fire in order (each seeing its own due time), then the queued frame callbacks run, as in a browser.
 * So engines with their own loop, and game logic built on timers, play deterministically without changes.
 */
export class VirtualClock {
  /** Frames played since the game booted. */
  tick = 0;
  /** Virtual milliseconds since the game booted. */
  ms = 0;
  readonly stepMs: number;
  private readonly frames = new Map<number, FrameRequestCallback>();
  private readonly timers = new Map<number, TimerEntry>();
  private order = 0;
  private readonly idle = new Map<number, IdleRequestCallback>();
  /** How deep we are in timer callbacks; nested zero-delay timers are clamped like a browser's. */
  private nesting = 0;
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

  // Node's own internals (fetch, streams) set timers through the same globals and need real ones, so a
  // timer created from node:internal code is passed through. Everything the game sets is virtual.
  readonly setTimeout = (handler: TimerHandler, delay = 0, ...args: unknown[]): number =>
    fromNode()
      ? (realSetTimeout(handler as () => void, delay, ...args) as unknown as number)
      : this.addTimer(handler, delay, undefined, args);

  // Like browsers, a zero interval still waits a little, so a stray setInterval(fn) can't hang a step.
  readonly setInterval = (handler: TimerHandler, delay = 0, ...args: unknown[]): number =>
    fromNode()
      ? (realSetInterval(handler as () => void, delay, ...args) as unknown as number)
      : this.addTimer(handler, delay, Math.max(1, Number(delay) || 0), args);

  readonly clearTimeout = (id?: number): void => {
    if (typeof id === "number") this.timers.delete(id);
    else if (id !== undefined) realClearTimeout(id);
  };

  readonly clearInterval = this.clearTimeout;

  /** Idle callbacks run once at the end of the next frame, with a generous deadline: a headless game is never busy. */
  readonly requestIdleCallback = (callback: IdleRequestCallback): number => {
    const id = this.nextId++;
    this.idle.set(id, callback);
    return id;
  };

  readonly cancelIdleCallback = (id: number): void => {
    this.idle.delete(id);
  };

  /** Virtual milliseconds until the next timer falls due (Infinity when none are set). */
  get untilNextTimer(): number {
    let next = Number.POSITIVE_INFINITY;
    for (const t of this.timers.values()) next = Math.min(next, t.due);
    return next - this.ms;
  }

  /** Timers and frame callbacks still waiting. */
  get pending(): { timers: number; frames: number } {
    return { timers: this.timers.size, frames: this.frames.size };
  }

  /** Advance `steps` frames: move time forward, fire the timers that fall due, then run the queued frame callbacks. */
  advance(steps: number): void {
    for (let i = 0; i < steps; i++) {
      const end = this.ms + this.stepMs;
      this.runTimers(end);
      this.ms = end;
      const due = [...this.frames.values()];
      this.frames.clear();
      for (const callback of due) callback(this.ms);
      this.runIdle();
      // Like debuff's clock, a frame counts once it completes, so a crash reports the frame that threw.
      this.tick++;
    }
  }

  /** Move time forward without a frame (for games that step themselves), firing timers that fall due. */
  advanceTime(ms: number): void {
    const end = this.ms + ms;
    this.runTimers(end);
    this.ms = end;
    if (ms > 0) this.runIdle();
  }

  /** Point timers, `performance.now`, `Date.now` and `Math.random` at this clock until {@link uninstall}. */
  install(): void {
    if (this.restore) return;
    const g = globalThis as unknown as Record<string, unknown>;
    const perf = globalThis.performance;
    const saved = {
      now: perf.now,
      dateNow: Date.now,
      random: Math.random,
      timers: (["setTimeout", "setInterval", "clearTimeout", "clearInterval"] as const).map((k) => [k, g[k]] as const),
    };
    perf.now = () => this.ms;
    Date.now = () => this.epoch + Math.floor(this.ms);
    Math.random = this.random;
    for (const [k] of saved.timers) g[k] = this[k];
    this.restore = () => {
      perf.now = saved.now;
      Date.now = saved.dateNow;
      Math.random = saved.random;
      for (const [k, v] of saved.timers) g[k] = v;
    };
  }

  uninstall(): void {
    this.restore?.();
    this.restore = undefined;
    this.timers.clear();
    this.frames.clear();
    this.idle.clear();
  }

  /** Run the idle callbacks queued so far; ones they queue wait for the next frame. */
  private runIdle(): void {
    if (!this.idle.size) return;
    const due = [...this.idle.values()];
    this.idle.clear();
    for (const callback of due) callback({ didTimeout: false, timeRemaining: () => 50 });
  }

  private addTimer(handler: TimerHandler, delay: number, every: number | undefined, args: unknown[]): number {
    const id = this.nextId++;
    const run =
      typeof handler === "function"
        ? () => (handler as (...a: unknown[]) => void)(...args)
        : () => {
            throw new TypeError("keiko's virtual timers don't evaluate strings; pass a function to setTimeout or setInterval");
          };
    // Browsers clamp timers set from inside timer callbacks to at least 4 ms, so a timer that keeps
    // rescheduling itself with no delay runs a few times per frame instead of forever.
    const wait = Math.max(this.nesting > 0 ? 4 : 0, Number(delay) || 0);
    this.timers.set(id, {
      due: this.ms + wait,
      every: every === undefined ? undefined : Math.max(every, this.nesting > 0 ? 4 : 1),
      run,
      order: this.order++,
    });
    return id;
  }

  /** Fire every timer due by `end`, earliest first (ties in the order they were set), with the clock at each due time. */
  private runTimers(end: number): void {
    for (let fired = 0; fired < 100_000; fired++) {
      let next: [number, TimerEntry] | undefined;
      for (const entry of this.timers) {
        const t = entry[1];
        if (t.due > end + 1e-6) continue; // tolerance for float drift: 60 frames of 1000/60 ms reach 1000 ms
        if (!next || t.due < next[1].due || (t.due === next[1].due && t.order < next[1].order)) next = entry;
      }
      if (!next) return;
      const [id, timer] = next;
      this.ms = Math.max(this.ms, timer.due);
      if (timer.every === undefined) this.timers.delete(id);
      else {
        timer.due += timer.every;
        timer.order = this.order++;
      }
      this.nesting++;
      try {
        timer.run();
      } finally {
        this.nesting--;
      }
    }
    throw new Error("Timers kept firing within one step (100 000 callbacks). Is a zero-delay timer rescheduling itself forever?");
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

type TimerEntry = { due: number; every: number | undefined; run: () => void; order: number };

/** Node's own clock and timers, captured before any game replaces them. The runner keeps real time with these. */
export const realNow: () => number = performance.now.bind(performance);
export const realSetTimeout: typeof setTimeout = globalThis.setTimeout;
export const realClearTimeout: typeof clearTimeout = globalThis.clearTimeout;
const realSetInterval: typeof setInterval = globalThis.setInterval;

/** True when the code setting a timer is Node's own (its bundled fetch, streams), not the game's. */
function fromNode(): boolean {
  const stack = new Error().stack ?? "";
  // Frame 0 is this function, frame 1 the clock's setTimeout; the caller is next.
  const caller = stack.split("\n")[3] ?? "";
  return caller.includes("node:");
}

/** Give pending promise callbacks and I/O a turn of the event loop, without waiting on a timer. */
export const yieldTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Wait real milliseconds, even while a game's clock is installed. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => realSetTimeout(resolve, ms));
