import type { Game, ParamValue } from "@debuff/core";

/** One recorded frame. Times are milliseconds. */
export interface FrameSample {
  tick: number;
  scene: string | undefined;
  /** Time since the previous frame (what the player feels). */
  intervalMs: number;
  /** Simulation time this frame (all steps). */
  updateMs: number;
  /** Render time (scene + render hooks). */
  renderMs: number;
  /** Simulation steps run this frame; more than 1 means the loop was catching up. */
  steps: number;
  quads: number;
  drawCalls: number;
  /** Long tasks (>50 ms main-thread stalls) the browser reported during this frame. */
  longTaskMs: number;
  /** performance.now() at the frame's start. */
  at: number;
}

/**
 * Records a per-frame breakdown through lifecycle hooks (dev only). Fixed-size ring buffers, no
 * allocation per frame. Also emits User Timing measures so phases show up in browser profilers.
 */
export class FrameRecorder {
  readonly size: number;
  private readonly fields = {
    tick: new Float64Array(0),
    interval: new Float64Array(0),
    update: new Float64Array(0),
    render: new Float64Array(0),
    steps: new Uint16Array(0),
    quads: new Uint32Array(0),
    drawCalls: new Uint32Array(0),
    longTask: new Float64Array(0),
    at: new Float64Array(0),
  };
  private readonly scenes: (string | undefined)[];
  private head = 0;
  private count = 0;
  private frameStart = 0;
  private lastFrameStart = 0;
  private updateStart = 0;
  private updateMs = 0;
  private steps = 0;
  private renderStart = 0;
  private readonly cleanups: (() => void)[] = [];
  /** Called after each recorded frame with its index (see `get`). */
  onFrame: ((index: number) => void) | undefined;

  constructor(
    private readonly game: Game,
    options: { size?: number; userTiming?: boolean } = {},
  ) {
    this.size = options.size ?? 240;
    for (const key of Object.keys(this.fields) as (keyof typeof this.fields)[]) {
      const Ctor = this.fields[key].constructor as new (n: number) => (typeof this.fields)[typeof key];
      this.fields[key] = new Ctor(this.size) as never;
    }
    this.scenes = new Array(this.size);
    const timing = options.userTiming ?? true;
    const { hooks } = game;
    this.cleanups.push(
      hooks.beforeUpdate(() => {
        if (this.steps === 0) this.startFrame();
        this.updateStart = performance.now();
      }),
      hooks.afterUpdate(() => {
        const end = performance.now();
        this.updateMs += end - this.updateStart;
        this.steps++;
        if (timing) measure("debuff:update", this.updateStart, end);
      }),
      hooks.beforeRender(() => {
        if (this.steps === 0) this.startFrame();
        this.renderStart = performance.now();
      }),
      hooks.afterRender((draw) => {
        const end = performance.now();
        if (timing) measure("debuff:render", this.renderStart, end);
        this.commit(end - this.renderStart, draw.quads, draw.drawCalls);
      }),
    );
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      const observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) this.attributeLongTask(e.startTime, e.duration);
      });
      observer.observe({ type: "longtask", buffered: false });
      this.cleanups.push(() => observer.disconnect());
    }
  }

  /** Number of recorded frames (up to `size`). */
  get length(): number {
    return this.count;
  }

  /** Sample `i` frames ago (0 = latest). */
  get(i: number): FrameSample | undefined {
    if (i < 0 || i >= this.count) return undefined;
    const k = (this.head - 1 - i + this.size) % this.size;
    const f = this.fields;
    return {
      tick: f.tick[k] ?? 0,
      scene: this.scenes[k],
      intervalMs: f.interval[k] ?? 0,
      updateMs: f.update[k] ?? 0,
      renderMs: f.render[k] ?? 0,
      steps: f.steps[k] ?? 0,
      quads: f.quads[k] ?? 0,
      drawCalls: f.drawCalls[k] ?? 0,
      longTaskMs: f.longTask[k] ?? 0,
      at: f.at[k] ?? 0,
    };
  }

  /** The latest `n` samples, oldest first (JSON-friendly, for agents). */
  recent(n = this.count): FrameSample[] {
    const out: FrameSample[] = [];
    for (let i = Math.min(n, this.count) - 1; i >= 0; i--) {
      const s = this.get(i);
      if (s) out.push(s);
    }
    return out;
  }

  dispose(): void {
    for (const c of this.cleanups) c();
  }

  private startFrame(): void {
    this.lastFrameStart = this.frameStart;
    this.frameStart = performance.now();
    this.updateMs = 0;
  }

  private commit(renderMs: number, quads: number, drawCalls: number): void {
    const k = this.head;
    const f = this.fields;
    f.tick[k] = this.game.clock.tick;
    f.interval[k] = this.lastFrameStart ? this.frameStart - this.lastFrameStart : 0;
    f.update[k] = this.updateMs;
    f.render[k] = renderMs;
    f.steps[k] = this.steps;
    f.quads[k] = quads;
    f.drawCalls[k] = drawCalls;
    f.longTask[k] = 0;
    f.at[k] = this.frameStart;
    this.scenes[k] = this.game.scene?.id;
    this.head = (this.head + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
    this.steps = 0;
    this.onFrame?.(0);
  }

  private attributeLongTask(start: number, duration: number): void {
    // Long-task entries arrive after the fact; credit the frame whose start precedes the task.
    for (let i = 0; i < this.count; i++) {
      const k = (this.head - 1 - i + this.size) % this.size;
      if ((this.fields.at[k] ?? 0) <= start) {
        this.fields.longTask[k] = (this.fields.longTask[k] ?? 0) + duration;
        return;
      }
    }
  }
}

function measure(name: string, start: number, end: number): void {
  try {
    performance.measure(name, { start, end });
  } catch {
    // User Timing L3 unsupported: skip.
  }
}

export interface Activity {
  at: number;
  /** "you" for the person at the keyboard, "agent" for MCP/tools, "scenario" for test runs. */
  who: string;
  action: string;
  detail?: string;
  /** Present for reversible changes (params). */
  undo?: () => void;
}

/** A moment the human flagged for an agent (or future self), with the game state at that tick. */
export interface Note {
  id: number;
  at: number;
  tick: number;
  text: string;
  state: unknown;
  /** Recent frame samples leading up to the note. */
  frames: FrameSample[];
}

const sessions = new WeakMap<Game, DevSession>();

/**
 * Shared dev state for a game: pause/step/speed, frame recording, an activity log and human notes.
 * The overlay, dev hooks and the agent link all use the same session.
 */
export class DevSession {
  readonly recorder: FrameRecorder;
  readonly activity: Activity[] = [];
  readonly notes: Note[] = [];
  /** Who paused the game, or undefined while running. */
  pausedBy: string | undefined;
  /** Pause automatically when a frame exceeds this many milliseconds (0 = off). */
  pauseOnSpikeMs = 0;
  /** performance.now() of the last agent action (agent link); -Infinity if never. */
  agentLastSeenAt = Number.NEGATIVE_INFINITY;
  private readonly listeners = new Set<() => void>();
  private refs = 0;
  private nextNote = 1;

  private constructor(readonly game: Game) {
    this.recorder = new FrameRecorder(game);
    this.recorder.onFrame = () => {
      const latest = this.recorder.get(0);
      if (this.pauseOnSpikeMs > 0 && latest && latest.intervalMs > this.pauseOnSpikeMs && !this.pausedBy) {
        this.pause("spike", `${latest.intervalMs.toFixed(1)} ms frame at tick ${latest.tick}`);
      }
    };
  }

  /** The session for `game`, created on first use. Call `release()` when done. */
  static acquire(game: Game): DevSession {
    let s = sessions.get(game);
    if (!s) {
      s = new DevSession(game);
      sessions.set(game, s);
    }
    s.refs++;
    return s;
  }

  release(): void {
    if (--this.refs > 0) return;
    this.recorder.dispose();
    sessions.delete(this.game);
  }

  get paused(): boolean {
    return this.pausedBy !== undefined;
  }

  /** An agent acted on this game in the last 30 seconds. */
  get agentConnected(): boolean {
    return performance.now() - this.agentLastSeenAt < 30_000;
  }

  agentSeen(): void {
    const wasConnected = this.agentConnected;
    this.agentLastSeenAt = performance.now();
    if (!wasConnected) this.log("agent", "connected");
  }

  pause(who = "you", detail?: string): void {
    if (this.pausedBy) return;
    this.game.stop();
    this.pausedBy = who;
    this.log(who, "paused", detail);
  }

  resume(who = "you"): void {
    if (!this.pausedBy) return;
    this.pausedBy = undefined;
    this.game.start();
    this.log(who, "resumed");
  }

  /** Advance exactly `n` fixed steps (pauses first, so the result stays put). */
  step(n = 1, who = "you"): void {
    if (!this.pausedBy) this.pause(who);
    this.game.step(n);
    this.changed();
  }

  setSpeed(scale: number, who = "you"): void {
    this.game.timeScale = scale;
    this.log(who, "speed", `${scale}×`);
  }

  /** Set a param and log it with an undo that restores the previous value. */
  setParam(group: string, key: string, value: ParamValue, who = "you"): void {
    const g = this.game.params.group(group);
    if (!g) throw new Error(`Unknown param group "${group}". Known: ${Object.keys(this.game.params.describe()).join(", ")}`);
    const previous = g.get(key);
    if (previous === value) return;
    g.set(key, value);
    this.log(who, "set", `${group}.${key} ${format(previous)} → ${format(value)}`, () => g.set(key, previous));
  }

  /** Flag the current moment with a note for an agent to pick up. */
  note(text: string): Note {
    const scene = this.game.scene as { inspect?: () => unknown } | undefined;
    const n: Note = {
      id: this.nextNote++,
      at: Date.now(),
      tick: this.game.clock.tick,
      text,
      state: scene?.inspect?.(),
      frames: this.recorder.recent(30),
    };
    this.notes.push(n);
    this.log("you", "noted", text);
    return n;
  }

  log(who: string, action: string, detail?: string, undo?: () => void): void {
    this.activity.push({ at: Date.now(), who, action, ...(detail === undefined ? {} : { detail }), ...(undo ? { undo } : {}) });
    if (this.activity.length > 200) this.activity.shift();
    this.changed();
  }

  /** Subscribe to state changes (pause, log, notes). Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  changed(): void {
    for (const fn of this.listeners) fn();
  }
}

const format = (v: ParamValue) => (typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v));

/**
 * Explain a frame in plain words, so a red bar points somewhere useful.
 * @internal exported for the overlay and tests
 */
export function diagnose(s: FrameSample, budgetMs = 1000 / 60): string {
  const work = s.updateMs + s.renderMs;
  if (s.intervalMs <= budgetMs * 1.05) return "on budget";
  const parts: string[] = [];
  if (s.longTaskMs > 0) parts.push(`the browser reported a ${s.longTaskMs.toFixed(0)} ms main-thread stall`);
  if (s.steps > 1) parts.push(`the loop caught up ${s.steps} steps after a late frame`);
  if (work > budgetMs * 0.75) {
    parts.push(
      s.updateMs >= s.renderMs
        ? `update took ${s.updateMs.toFixed(1)} ms`
        : `render took ${s.renderMs.toFixed(1)} ms (${s.quads} quads, ${s.drawCalls} draw calls)`,
    );
  } else if (!s.longTaskMs) {
    parts.push(`the game only worked ${work.toFixed(1)} ms; the time went elsewhere (GC, another tab, the browser or OS)`);
  }
  return parts.join("; ");
}
