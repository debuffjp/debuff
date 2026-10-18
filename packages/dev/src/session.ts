import type { Game, GameErrorContext, ParamValue } from "@debuffjp/core";
import { myaku, type Profiler } from "myaku";
import { type ExplainedError, errorKey, explainError, mapLocation } from "./explain.js";
import type { DrivableInput } from "./index.js";
import { fastForward, InputRecording, pagePath, type Replay, type ReplayTarget, type RewindRequest, storeRewind } from "./replay.js";

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
  /** Input recorded since page load, for replays (present once `attachInput` is called). */
  recording: InputRecording | undefined;
  /** The session as it was before the last rewind, so you can scrub forward again until play branches off. */
  private timeline: { replay: Replay; tick: number; events: number } | undefined;
  /** Uncaught errors, unhandled rejections and loop errors, explained and de-duplicated (max 50). */
  readonly errors: ExplainedError[] = [];
  /** The error object the loop just reported, so its rethrow isn't counted twice. */
  private lastLoopError: unknown;
  private readonly errorKeys = new WeakMap<ExplainedError, string>();
  private readonly onError = (e: ErrorEvent) => {
    if (e.error !== undefined && e.error === this.lastLoopError) return;
    this.addError(explainError(e.error ?? new Error(e.message)));
  };
  private readonly onRejection = (e: PromiseRejectionEvent) => this.addError(explainError(e.reason));
  private readonly unsubscribeLoopError: () => void;
  /** Who paused the game, or undefined while running. */
  pausedBy: string | undefined;
  /** Pause automatically when a frame exceeds this many milliseconds (0 = off). */
  pauseOnSpikeMs = 0;
  /** performance.now() of the last agent action (agent link); -Infinity if never. */
  agentLastSeenAt = Number.NEGATIVE_INFINITY;
  private readonly listeners = new Set<() => void>();
  private refs = 0;
  private nextNote = 1;

  /** myaku: hitches explained (`profile()`), with debuff's update and render as spans. */
  readonly profiler: Profiler;
  private readonly unsubscribeSpans: (() => void)[];

  private constructor(readonly game: Game) {
    this.recorder = new FrameRecorder(game);
    this.profiler = myaku();
    let updateStart = 0;
    let renderStart = 0;
    this.unsubscribeSpans = [
      game.hooks.beforeUpdate(() => {
        updateStart = performance.now();
      }),
      game.hooks.afterUpdate(() => this.profiler.addSpan("update", performance.now() - updateStart)),
      game.hooks.beforeRender(() => {
        renderStart = performance.now();
      }),
      game.hooks.afterRender(() => this.profiler.addSpan("render", performance.now() - renderStart)),
    ];
    this.recorder.onFrame = () => {
      const latest = this.recorder.get(0);
      if (this.pauseOnSpikeMs > 0 && latest && latest.intervalMs > this.pauseOnSpikeMs && !this.pausedBy) {
        this.pause("spike", `${latest.intervalMs.toFixed(1)} ms frame at tick ${latest.tick}`);
      }
    };
    this.unsubscribeLoopError = game.hooks.error((error, context) => this.onLoopError(error, context));
    addEventListener("error", this.onError);
    addEventListener("unhandledrejection", this.onRejection);
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
    for (const off of this.unsubscribeSpans) off();
    this.profiler.stop();
    this.recording?.dispose();
    removeEventListener("error", this.onError);
    this.unsubscribeLoopError();
    removeEventListener("unhandledrejection", this.onRejection);
    sessions.delete(this.game);
  }

  get paused(): boolean {
    return this.pausedBy !== undefined;
  }

  /** An agent acted on this game in the last 30 seconds. */
  get agentConnected(): boolean {
    return this.agentsAttached > 0 || performance.now() - this.agentLastSeenAt < 30_000;
  }

  /** Agents holding an attach connection through the dev server (agent link). */
  agentsAttached = 0;

  /** Update attached agents from the dev server; logs connects and disconnects. */
  setAgentsAttached(n: number): void {
    const was = this.agentsAttached > 0;
    this.agentsAttached = n;
    if (n > 0 && !was) this.log("agent", "connected");
    else if (n === 0 && was) {
      this.agentLastSeenAt = Number.NEGATIVE_INFINITY;
      this.log("agent", "disconnected");
    } else this.changed();
  }

  agentSeen(): void {
    const wasConnected = this.agentConnected;
    this.agentLastSeenAt = performance.now();
    if (!wasConnected) this.log("agent", "connected");
    else this.changed();
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

  /** Start recording this input for replays. Idempotent. */
  attachInput(input: DrivableInput): void {
    this.recording ??= new InputRecording(this.game, input);
  }

  /**
   * Everything known about this session: the pre-rewind timeline while you're still parked where a rewind
   * left you, otherwise what was actually played (any new tick or input branches off the old timeline).
   */
  known(): Replay | undefined {
    const recording = this.recording;
    if (!recording) return undefined;
    const t = this.timeline;
    if (t && this.game.clock.tick === t.tick && recording.count === t.events) return t.replay;
    this.timeline = undefined;
    return recording.toReplay();
  }

  /**
   * Go back (or forward, within the known session) to `tick`: the page reloads and replays its inputs to
   * that tick, so the game's state is exactly what it was, then stays paused there.
   */
  rewind(tick: number): void {
    const timeline = this.known();
    if (!timeline) throw new Error("Rewind needs input: use devTools({ input })");
    storeRewind({ v: 1, page: pagePath(), timeline, tick: Math.max(0, Math.min(Math.round(tick), timeline.ticks)) });
    // Reload a moment later, so an agent's call can still report back before the page goes away.
    setTimeout(() => location.reload(), 100);
  }

  /**
   * Called just before the dev server reloads the page for a code change: save the session so the new
   * code can replay it to this same tick (state-preserving reload). Running games keep running.
   */
  keepForReload(): void {
    const recording = this.recording;
    if (!recording) return;
    const timeline = recording.toReplay();
    storeRewind({ v: 1, page: pagePath(), timeline, tick: timeline.ticks, reason: "reload", resume: !this.paused });
  }

  /** Finish a rewind or a code reload after the page loads again (see `rewind` and `keepForReload`). */
  restore(request: RewindRequest, target: ReplayTarget): void {
    const recording = this.recording;
    if (!recording) return;
    for (const w of request.timeline.warnings) recording.warn(w);
    const t0 = performance.now();
    fastForward(target, request.timeline.steps, request.tick);
    if (request.reason === "reload") {
      const ms = Math.round(performance.now() - t0);
      this.log("you", "kept your place", `replayed ${request.tick} ticks with the new code in ${ms} ms`);
      if (!request.resume) this.pause("you", `reloaded at tick ${request.tick}`);
      return;
    }
    this.timeline = { replay: request.timeline, tick: this.game.clock.tick, events: recording.count };
    this.pause("you", `rewound to tick ${request.tick}`);
    this.log("you", "rewound", `to tick ${request.tick} of ${request.timeline.ticks}`);
  }

  setSpeed(scale: number, who = "you"): void {
    // Slow motion changes the simulation itself, so a replay (which always runs at 1×) can't match it.
    if (scale !== 1) this.recording?.warn(`Speed was set to ${scale}× during the session; replays run at 1×.`);
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

  /** The loop stopped on an error: record it with where it happened and show the game as paused by it. */
  private onLoopError(error: unknown, context: GameErrorContext): void {
    this.lastLoopError = error;
    const explained = this.addError(explainError(error, context));
    // The game already stopped itself; reflect that so "play" retries from here.
    this.pausedBy = "error";
    this.log("error", "stopped the game", `in ${context.phase}: ${explained.message}`);
  }

  private addError(e: ExplainedError): ExplainedError {
    // Key on the location as first reported: source-mapping later changes `where`, and repeats must still match.
    const key = errorKey(e);
    const same = this.errors.find((x) => this.errorKeys.get(x) === key);
    if (same) {
      same.count++;
      this.changed();
      return same;
    }
    this.errors.push(e);
    this.errorKeys.set(e, key);
    if (this.errors.length > 50) this.errors.shift();
    this.changed();
    // Point at the original source line, not the compiled module the browser ran.
    void mapLocation(e).then((moved) => moved && this.changed());
    return e;
  }

  /** Forget recorded errors (after fixing them). */
  clearErrors(): void {
    this.errors.length = 0;
    this.changed();
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
  if (s.intervalMs <= budgetMs * HITCH && work <= budgetMs * 0.75)
    return "a little late: normal display timing jitter, not a dropped frame";
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

/** A frame counts as a hitch (a visibly dropped frame) past this multiple of the budget. */
export const HITCH = 1.5;

export interface FrameSummary {
  frames: number;
  /** Seconds the summary covers. */
  seconds: number;
  avgWorkMs: number;
  p95WorkMs: number;
  /** Share of the frame budget left unused at p95 work, 0..1. */
  headroom: number;
  /** Frames longer than `HITCH` × budget. */
  hitches: number;
  /** Hitches where update + render alone used most of the budget: the game's own code. */
  gameHitches: number;
  /** Hitches where the game did little work: GC, other tabs, the browser or OS. */
  outsideHitches: number;
}

/**
 * Summarise recent frames into what matters: how much headroom the game has, and whether dropped
 * frames come from the game's own work or from outside it.
 */
export function summarize(samples: readonly FrameSample[], budgetMs = 1000 / 60): FrameSummary {
  const works = samples.map((s) => s.updateMs + s.renderMs).sort((a, b) => a - b);
  const p95 = works[Math.min(works.length - 1, Math.floor(works.length * 0.95))] ?? 0;
  let hitches = 0;
  let gameHitches = 0;
  let seconds = 0;
  for (const s of samples) {
    seconds += s.intervalMs / 1000;
    if (s.intervalMs <= budgetMs * HITCH) continue;
    hitches++;
    if (s.updateMs + s.renderMs > budgetMs * 0.75) gameHitches++;
  }
  return {
    frames: samples.length,
    seconds,
    avgWorkMs: works.length ? works.reduce((a, b) => a + b, 0) / works.length : 0,
    p95WorkMs: p95,
    headroom: Math.max(0, 1 - p95 / budgetMs),
    hitches,
    gameHitches,
    outsideHitches: hitches - gameHitches,
  };
}
