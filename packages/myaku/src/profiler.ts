import { type Evidence, explainFrame, type Verdict } from "./explain.js";
import { type Report, summarize } from "./report.js";

/** One frame, as {@link Profiler.frame} returns it. Times are milliseconds. */
export interface Frame {
  /** Frames since profiling started. */
  index: number;
  /** When the frame started (`requestAnimationFrame` time). */
  at: number;
  /** Time since the previous frame started: what the player feels. */
  intervalMs: number;
  /** Time the game's frame callbacks ran. */
  cpuMs: number;
  /** Draw calls (WebGL `draw*`, Canvas 2D `drawImage`/`fill*`/`stroke*`). */
  draws: number;
  /** Texture and buffer uploads, and the bytes they sent to the GPU. */
  uploads: number;
  uploadBytes: number;
  /** Shaders compiled and programs linked. */
  compiles: number;
  /** How much the JS heap shrank since the previous frame (Chromium only; 0 elsewhere). */
  heapDropBytes: number;
  /** Time in each named span (see {@link Profiler.span}). */
  spans: Record<string, number>;
}

export interface ProfilerOptions {
  /** Frames kept (default 600, ten seconds at 60 fps). */
  size?: number;
  /**
   * A frame slower than this is a hitch. Default: 1.5× the display's frame interval, measured from
   * the first frames (25 ms on a 60 Hz display).
   */
  budgetMs?: number;
  /** Count draw calls, uploads and compiles by wrapping canvas contexts (default true). */
  contexts?: boolean;
  /** Expose the profiler as `window.__MYAKU__` for tools and agents (default true). */
  global?: boolean;
  /**
   * Add update and render spans for engines that announce themselves: PixiJS 8, three.js and a global
   * `Phaser` (default true, with `myaku()`). Others: `adapt(profiler, game)`.
   */
  engines?: boolean;
}

/** Frames at start-up (scripts compiling, assets decoding) that don't count as play. */
export const WARMUP_FRAMES = 10;

/** Up to this many named spans per profiler. */
const MAX_SPANS = 16;
const REFRESH_RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];

/** A long-animation-frame script entry, kept to attribute slow frames. */
interface ScriptTime {
  start: number;
  end: number;
  ms: number;
  source: string;
  fn: string;
  char: number;
  invoker: string;
}

interface Stall {
  start: number;
  end: number;
  layoutMs: number;
  scripts: ScriptTime[];
}

/**
 * The profiler: frame boundaries from `requestAnimationFrame`, GPU work from wrapped canvas contexts,
 * and attribution from the browser's Long Animation Frames entries. Everything lives in fixed-size
 * typed arrays, so profiling doesn't allocate per frame (and doesn't cause the GC it looks for).
 */
export class Profiler {
  readonly size: number;
  private readonly f: {
    at: Float64Array;
    interval: Float64Array;
    cpu: Float64Array;
    draws: Uint32Array;
    uploads: Uint32Array;
    uploadBytes: Float64Array;
    compiles: Uint16Array;
    heapDrop: Float64Array;
    spans: Float64Array;
  };
  private readonly spanNames: string[] = [];
  private head = 0;
  private count = 0;
  private total = 0;
  /** Current frame, accumulating. */
  private cur = {
    at: -1,
    cpu: 0,
    draws: 0,
    uploads: 0,
    uploadBytes: 0,
    compiles: 0,
    heap: 0,
    slowMs: 0,
    slowSite: undefined as CallSite | undefined,
    slowName: "",
  };
  /** Per frame: the slowest frame callback and where it was registered. */
  private readonly slow: { site: CallSite | undefined; name: string }[];
  /** The URL of myaku's own code, as it appears in stacks. */
  private readonly ownUrl = callSite(new Error().stack ?? "", "")?.url ?? "";
  private readonly curSpans = new Float64Array(MAX_SPANS);
  private lastHeap = 0;
  /** Heap readings taken and how many differed from the one before: is the heap reported live? */
  private heapReads = 0;
  private heapChanges = 0;
  /** Game canvas contexts instrumented (myaku's own overlay excluded). */
  private gameContexts = 0;
  private spansDropped = false;
  private readonly startedAt = typeof performance === "undefined" ? 0 : performance.now();
  private fixedBudget: number | undefined;
  private displayMs: number | undefined;
  private readonly stalls: Stall[] = [];
  private readonly hidden: [number, number][] = [];
  private hiddenSince: number | undefined;
  private readonly cleanups: (() => void)[] = [];
  private running = true;
  /** Overhead of the profiler's own bookkeeping, per frame, averaged. */
  private overhead = 0;
  private readonly baseSupport: { attribution: boolean; heap: boolean; contexts: boolean };
  private readonly listeners = new Set<(profiler: Profiler) => void>();

  constructor(options: ProfilerOptions = {}) {
    this.size = options.size ?? 600;
    const n = this.size;
    this.f = {
      at: new Float64Array(n),
      interval: new Float64Array(n),
      cpu: new Float64Array(n),
      draws: new Uint32Array(n),
      uploads: new Uint32Array(n),
      uploadBytes: new Float64Array(n),
      compiles: new Uint16Array(n),
      heapDrop: new Float64Array(n),
      spans: new Float64Array(n * MAX_SPANS),
    };
    this.fixedBudget = options.budgetMs;
    this.slow = Array.from({ length: n }, () => ({ site: undefined, name: "" }));
    const loaf =
      typeof PerformanceObserver !== "undefined" && (PerformanceObserver.supportedEntryTypes ?? []).includes("long-animation-frame");
    this.baseSupport = { attribution: loaf, heap: heapUsed() !== undefined, contexts: options.contexts !== false };
    this.wrapFrames();
    if (options.contexts !== false) this.wrapContexts();
    if (loaf) this.observeStalls();
    this.watchVisibility();
    if (options.global !== false && typeof window !== "undefined") {
      (window as unknown as { __MYAKU__?: Profiler }).__MYAKU__ = this;
      this.cleanups.push(() => {
        const w = window as unknown as { __MYAKU__?: Profiler };
        if (w.__MYAKU__ === this) delete w.__MYAKU__;
      });
    }
  }

  /** Frames recorded so far (up to {@link size}). */
  get length(): number {
    return this.count;
  }

  /** The hitch threshold in milliseconds. Set it to override the measured one; `undefined` measures again. */
  get budgetMs(): number {
    return this.fixedBudget ?? (this.displayMs ?? 1000 / 60) * 1.5;
  }
  set budgetMs(ms: number | undefined) {
    this.fixedBudget = ms;
  }

  /** The display's frame interval, once measured. */
  get displayIntervalMs(): number | undefined {
    return this.displayMs;
  }

  /** Average time myaku itself spends per frame, in ms. */
  get overheadMs(): number {
    return this.overhead;
  }

  /** The frame `ago` frames back (0 = the latest complete frame). */
  frame(ago = 0): Frame | undefined {
    if (ago < 0 || ago >= this.count) return undefined;
    const k = (this.head - 1 - ago + this.size) % this.size;
    const f = this.f;
    const spans: Record<string, number> = {};
    for (let s = 0; s < this.spanNames.length; s++) {
      const ms = f.spans[k * MAX_SPANS + s] ?? 0;
      if (ms > 0) spans[this.spanNames[s] as string] = ms;
    }
    return {
      index: this.total - 1 - ago,
      at: f.at[k] ?? 0,
      intervalMs: f.interval[k] ?? 0,
      cpuMs: f.cpu[k] ?? 0,
      draws: f.draws[k] ?? 0,
      uploads: f.uploads[k] ?? 0,
      uploadBytes: f.uploadBytes[k] ?? 0,
      compiles: f.compiles[k] ?? 0,
      heapDropBytes: f.heapDrop[k] ?? 0,
      spans,
    };
  }

  /** Recent frames, oldest first. */
  frames(count = this.count): Frame[] {
    const out: Frame[] = [];
    for (let i = Math.min(count, this.count) - 1; i >= 0; i--) {
      const fr = this.frame(i);
      if (fr) out.push(fr);
    }
    return out;
  }

  /** Why a frame was slow. `ago` as in {@link frame}. */
  explain(ago = 0): Verdict | undefined {
    const frame = this.frame(ago);
    return frame ? explainFrame(frame, this.evidence(frame), this.budgetMs) : undefined;
  }

  /** Every slow frame still in the buffer, explained, oldest first. */
  hitches(): Verdict[] {
    const out: Verdict[] = [];
    for (let i = this.count - 1; i >= 0; i--) {
      const fr = this.frame(i);
      if (fr && fr.index >= WARMUP_FRAMES && fr.intervalMs > this.budgetMs) out.push(explainFrame(fr, this.evidence(fr), this.budgetMs));
    }
    return out;
  }

  /**
   * What this browser lets myaku see. `heap` is true only while heap readings change often enough to catch
   * a collection: some browsers report a coarse, rarely refreshed value, which can't show GC.
   */
  get support(): { attribution: boolean; heap: boolean; contexts: boolean } {
    const live = this.heapReads < 120 || this.heapChanges * 60 >= this.heapReads;
    return { ...this.baseSupport, heap: this.baseSupport.heap && live };
  }

  /**
   * Problems that make the numbers incomplete, in plain words: no frames seen, no canvas context seen,
   * spans dropped, heap not reported. Empty when myaku sees everything it can.
   */
  warnings(): string[] {
    const out: string[] = [];
    const elapsed = performance.now() - this.startedAt;
    if (this.total === 0 && elapsed > 2000) {
      out.push(
        "No frames recorded. The game may have kept its own reference to requestAnimationFrame before myaku loaded: load myaku first (its own script tag, before the game's).",
      );
    }
    if (this.baseSupport.contexts && this.gameContexts === 0 && this.total > 60 && hasGameCanvas()) {
      out.push(
        "No canvas context seen, so draws, uploads and compiles aren't counted. The game created its context before myaku loaded: load myaku first.",
      );
    }
    if (this.spansDropped) {
      out.push(`More than ${MAX_SPANS} span names: the rest are added up under "other".`);
    }
    if (this.baseSupport.heap && !this.support.heap) {
      out.push("This browser reports the heap too coarsely to see garbage collection, so GC hitches show as unknown.");
    }
    return out;
  }

  /** Percentiles, hitches with verdicts, causes and spans for the frames in the buffer. JSON-serialisable. */
  report(): Report {
    return summarize(this.frames(), this.hitches(), {
      budgetMs: this.budgetMs,
      displayIntervalMs: this.displayMs,
      overheadMs: this.overhead,
      support: this.support,
      warnings: this.warnings(),
    });
  }

  /** Call `fn` after every frame (read the frame with `profiler.frame()`). Returns an unsubscribe function. */
  subscribe(fn: (profiler: Profiler) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Time a named system: `profiler.span("physics", () => world.step(dt))`. Returns what `fn` returns. */
  span<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.addSpan(name, performance.now() - start);
    }
  }

  /** Start a span; call the returned function to end it. For spans that cross callbacks. */
  begin(name: string): () => void {
    const start = performance.now();
    return () => this.addSpan(name, performance.now() - start);
  }

  /** Add time to a span directly, for adapters that measure themselves. */
  addSpan(name: string, ms: number): void {
    let i = this.spanNames.indexOf(name);
    if (i < 0) {
      if (this.spanNames.length >= MAX_SPANS - 1) {
        // Keep the last slot for everything past the limit, so time isn't silently lost.
        this.spansDropped = true;
        i = this.spanNames.indexOf("other");
        if (i < 0) i = this.spanNames.push("other") - 1;
      } else i = this.spanNames.push(name) - 1;
    }
    // Browsers round performance.now() (to 0.1 ms or coarser), so cheap work often measures 0. Count it
    // as a sliver above 0, so a span that ran still appears in frames and reports (as 0 ms).
    this.curSpans[i] = (this.curSpans[i] ?? 0) + Math.max(ms, Number.MIN_VALUE);
  }

  /** Run `fn` when the profiler stops (adapters use this to stop watching). */
  onStop(fn: () => void): void {
    this.cleanups.push(fn);
  }

  /** Forget the frames recorded so far (keeps measuring). Frame numbers keep counting up. */
  reset(): void {
    this.count = 0;
    this.head = 0;
    this.stalls.length = 0;
    this.hidden.length = 0;
  }

  /** Stop profiling and restore everything it wrapped. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const fn of this.cleanups.splice(0).reverse()) fn();
  }

  // ---- capture ---------------------------------------------------------------------------------

  private wrapFrames(): void {
    if (typeof requestAnimationFrame === "undefined") return;
    const raf = globalThis.requestAnimationFrame;
    const self = this;
    // The browser attributes frame callbacks to this wrapper, so remember where each callback was
    // registered (one stack capture per distinct callback) to point at the game's code instead.
    const sites = new WeakMap<FrameRequestCallback, CallSite | null>();
    const wrapped = function requestAnimationFrame(callback: FrameRequestCallback): number {
      let site = sites.get(callback);
      if (site === undefined) {
        site = callSite(new Error().stack ?? "", self.ownUrl);
        sites.set(callback, site);
      }
      return raf.call(globalThis, (t: number) => {
        if (self.running && t !== self.cur.at) self.startFrame(t);
        const start = performance.now();
        try {
          callback(t);
        } finally {
          const ms = performance.now() - start;
          self.cur.cpu += ms;
          if (ms > self.cur.slowMs) {
            self.cur.slowMs = ms;
            self.cur.slowSite = site ?? undefined;
            self.cur.slowName = callback.name;
          }
        }
      });
    };
    globalThis.requestAnimationFrame = wrapped;
    this.cleanups.push(() => {
      if (globalThis.requestAnimationFrame === wrapped) globalThis.requestAnimationFrame = raf;
    });
  }

  private startFrame(t: number): void {
    const t0 = performance.now();
    // A heap drop seen now happened during the frame that's closing.
    const heap = heapUsed();
    this.cur.heap = heap !== undefined && this.lastHeap > heap ? this.lastHeap - heap : 0;
    if (heap !== undefined) {
      this.heapReads++;
      if (heap !== this.lastHeap) this.heapChanges++;
      this.lastHeap = heap;
    }
    if (this.cur.at >= 0) this.commit(t);
    this.cur.at = t;
    this.cur.cpu = 0;
    this.cur.draws = 0;
    this.cur.uploads = 0;
    this.cur.uploadBytes = 0;
    this.cur.compiles = 0;
    this.cur.heap = 0;
    this.cur.slowMs = 0;
    this.cur.slowSite = undefined;
    this.cur.slowName = "";
    this.curSpans.fill(0);
    const spent = performance.now() - t0;
    this.overhead = this.overhead === 0 ? spent : this.overhead * 0.98 + spent * 0.02;
  }

  /** Close the current frame, now that the next starts at `next`. */
  private commit(next: number): void {
    const k = this.head;
    const f = this.f;
    // A frame lasts at least as long as its own code ran. Chrome can stamp the next frame on the regular
    // grid even when this one's callbacks overran (31 ms of work, then a timestamp 16.7 ms later), and
    // Long Animation Frames only reports frames over 50 ms, so without this those hitches go unseen.
    const interval = Math.max(next - this.cur.at, this.cur.cpu);
    f.at[k] = this.cur.at;
    f.interval[k] = interval;
    f.cpu[k] = this.cur.cpu;
    f.draws[k] = this.cur.draws;
    f.uploads[k] = this.cur.uploads;
    f.uploadBytes[k] = this.cur.uploadBytes;
    f.compiles[k] = Math.min(this.cur.compiles, 65535);
    f.heapDrop[k] = this.cur.heap;
    f.spans.set(this.curSpans, k * MAX_SPANS);
    const slow = this.slow[k] as { site: CallSite | undefined; name: string };
    slow.site = this.cur.slowSite;
    slow.name = this.cur.slowName;
    this.head = (k + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
    this.total++;
    if (this.total >= 30 && this.total % 30 === 0) this.measureDisplay();
    this.pruneStalls();
    for (const fn of this.listeners) fn(this);
  }

  /**
   * The display's refresh interval: the median of the last 30 frames, snapped to a common rate.
   * Measured again every 30 frames, keeping the fastest rate seen: frames can't come faster than the
   * display, but a slow stretch (start-up, a GPU-heavy scene) can make it look slower.
   */
  private measureDisplay(): void {
    const intervals: number[] = [];
    for (let i = 0; i < Math.min(30, this.count); i++) {
      const v = this.f.interval[(this.head - 1 - i + this.size) % this.size] ?? 0;
      if (v > 0) intervals.push(v);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    // Over ~30 fps the browser is throttling (hidden window, power saving): measure again later.
    if (!median || median > 34) return;
    const hz = REFRESH_RATES.reduce((best, r) => (Math.abs(1000 / r - median) < Math.abs(1000 / best - median) ? r : best));
    if (this.displayMs === undefined || 1000 / hz < this.displayMs) this.displayMs = 1000 / hz;
  }

  private wrapContexts(): void {
    const proto = typeof HTMLCanvasElement === "undefined" ? undefined : HTMLCanvasElement.prototype;
    const protos = [proto, typeof OffscreenCanvas === "undefined" ? undefined : OffscreenCanvas.prototype].filter(Boolean) as {
      getContext: (...args: unknown[]) => unknown;
    }[];
    const seen = new WeakSet<object>();
    for (const p of protos) {
      const original = p.getContext;
      const self = this;
      p.getContext = function (this: unknown, ...args: unknown[]) {
        const ctx = original.apply(this, args);
        if (ctx && typeof ctx === "object" && !seen.has(ctx)) {
          seen.add(ctx);
          self.instrument(ctx as Record<string, unknown>, String(args[0]));
          if (!isOverlayCanvas(this)) self.gameContexts++;
        }
        return ctx;
      };
      this.cleanups.push(() => {
        p.getContext = original;
      });
    }
  }

  /** Count draws, uploads and compiles on one context, by shadowing its methods. */
  private instrument(ctx: Record<string, unknown>, kind: string): void {
    const cur = this.cur;
    const wrap = (name: string, after: (args: unknown[]) => void) => {
      const fn = ctx[name];
      if (typeof fn !== "function") return;
      ctx[name] = function (this: unknown, ...args: unknown[]) {
        after(args);
        return (fn as (...a: unknown[]) => unknown).apply(this, args);
      };
    };
    const draw = () => {
      cur.draws++;
    };
    if (kind === "2d") {
      for (const name of ["drawImage", "fill", "stroke", "fillRect", "strokeRect", "fillText", "strokeText", "putImageData"])
        wrap(name, draw);
      return;
    }
    if (!kind.startsWith("webgl") && kind !== "experimental-webgl") return;
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"])
      wrap(name, draw);
    const upload = (args: unknown[]) => {
      cur.uploads++;
      cur.uploadBytes += textureBytes(args);
    };
    for (const name of ["texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D", "compressedTexImage2D", "compressedTexSubImage2D"])
      wrap(name, upload);
    const buffer = (args: unknown[]) => {
      cur.uploads++;
      cur.uploadBytes += bufferBytes(args[1]);
    };
    wrap("bufferData", buffer);
    wrap("bufferSubData", buffer);
    wrap("compileShader", () => {
      cur.compiles++;
    });
    wrap("linkProgram", () => {
      cur.compiles++;
    });
  }

  private observeStalls(): void {
    const observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as LoafEntry[]) {
        this.stalls.push({
          start: e.startTime,
          end: e.startTime + e.duration,
          layoutMs: e.styleAndLayoutDuration ?? 0,
          scripts: (e.scripts ?? []).map((s) => ({
            start: s.startTime,
            end: s.startTime + s.duration,
            ms: s.duration,
            source: s.sourceURL ?? "",
            fn: s.sourceFunctionName ?? "",
            char: s.sourceCharPosition ?? -1,
            invoker: s.invoker ?? "",
          })),
        });
      }
    });
    observer.observe({ type: "long-animation-frame", buffered: true });
    this.cleanups.push(() => observer.disconnect());
  }

  /** Forget stalls older than the oldest frame in the buffer. */
  private pruneStalls(): void {
    const oldest = this.frame(this.count - 1)?.at ?? 0;
    while (this.stalls.length && (this.stalls[0] as Stall).end < oldest - 1000) this.stalls.shift();
    while (this.hidden.length && (this.hidden[0] as [number, number])[1] < oldest - 1000) this.hidden.shift();
  }

  private watchVisibility(): void {
    if (typeof document === "undefined") return;
    const onChange = () => {
      const now = performance.now();
      if (document.hidden) this.hiddenSince = now;
      else if (this.hiddenSince !== undefined) {
        this.hidden.push([this.hiddenSince, now]);
        this.hiddenSince = undefined;
      }
    };
    document.addEventListener("visibilitychange", onChange);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", onChange));
  }

  /** What the browser told us about the time from this frame's start to the next one's. */
  private evidence(frame: Frame): Evidence {
    const start = frame.at;
    const end = start + frame.intervalMs;
    const scripts: Evidence["scripts"] = [];
    let layoutMs = 0;
    let stallMs = 0;
    for (const s of this.stalls) {
      if (s.end <= start || s.start >= end) continue;
      layoutMs += s.layoutMs;
      stallMs += Math.min(s.end, end) - Math.max(s.start, start);
      for (const sc of s.scripts) {
        if (sc.end <= start || sc.start >= end) continue;
        if (this.ownUrl && sc.source.split("?")[0] === this.ownUrl.split("?")[0]) {
          // Our rAF wrapper: the work was the game's slowest frame callback this frame.
          const slow = this.slow[(this.head - 1 - (this.total - 1 - frame.index) + this.size) % this.size];
          scripts.push({
            ms: sc.ms,
            source: slow?.site?.url ?? "",
            fn: slow?.name || slow?.site?.fn || "",
            char: -1,
            ...(slow?.site ? { line: slow.site.line } : {}),
            invoker: "FrameRequestCallback",
          });
        } else scripts.push({ ms: sc.ms, source: sc.source, fn: sc.fn, char: sc.char, invoker: sc.invoker });
      }
    }
    scripts.sort((a, b) => b.ms - a.ms);
    const hidden = this.hidden.some(([a, b]) => a < end && b > start) || (this.hiddenSince !== undefined && this.hiddenSince < end);
    return {
      scripts,
      layoutMs,
      stallMs,
      hidden,
      throttled: this.throttled(frame),
      attribution: this.support.attribution,
      heap: this.support.heap,
    };
  }

  /**
   * Whether frames around this one were slow while the game sat idle and the browser reported no stalls:
   * the browser was throttling frames (an occluded or background window, power saving), not the game.
   */
  private throttled(frame: Frame): boolean {
    const ago = this.total - 1 - frame.index;
    let idleSlow = 0;
    for (let i = ago - 2; i <= ago + 2; i++) {
      const f = this.frame(i);
      if (f && f.intervalMs > this.budgetMs && f.cpuMs < 2 && !this.stalledDuring(f.at, f.at + f.intervalMs)) idleSlow++;
    }
    return idleSlow >= 4;
  }

  private stalledDuring(start: number, end: number): boolean {
    return this.stalls.some((s) => s.end > start && s.start < end);
  }
}

interface LoafEntry {
  startTime: number;
  duration: number;
  styleAndLayoutDuration?: number;
  scripts?: {
    startTime: number;
    duration: number;
    sourceURL?: string;
    sourceFunctionName?: string;
    sourceCharPosition?: number;
    invoker?: string;
  }[];
}

function heapUsed(): number | undefined {
  const memory =
    typeof performance === "undefined" ? undefined : (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory?.usedJSHeapSize;
}

/** Bytes a `tex*Image*` call sends: from explicit width/height, or the source's size, at 4 bytes a pixel. */
function textureBytes(args: unknown[]): number {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a && typeof a === "object") {
      if (ArrayBuffer.isView(a)) return a.byteLength;
      const src = a as {
        width?: number;
        height?: number;
        videoWidth?: number;
        videoHeight?: number;
        naturalWidth?: number;
        naturalHeight?: number;
      };
      const w = src.videoWidth || src.naturalWidth || src.width;
      const h = src.videoHeight || src.naturalHeight || src.height;
      if (w && h) return w * h * 4;
    }
  }
  // texImage2D(target, level, internalformat, width, height, …) with no data: an allocation.
  const w = args[3];
  const h = args[4];
  return typeof w === "number" && typeof h === "number" ? w * h * 4 : 0;
}

function bufferBytes(data: unknown): number {
  if (typeof data === "number") return data;
  if (data && typeof data === "object" && "byteLength" in data) return (data as { byteLength: number }).byteLength;
  return 0;
}

/** Where a function was registered, from a stack line. */
interface CallSite {
  url: string;
  line: number;
  fn: string;
}

const STACK_LINE = /(?:at\s+(?:([^\s(]+)\s+\()?|^([^@]*)@)((?:https?|file|blob):[^\s)]+?):(\d+):\d+/;

/** The first stack frame outside `own` (myaku's file), or the first frame when `own` is empty. */
function callSite(stack: string, own: string): CallSite | null {
  const ownBase = own.split("?")[0];
  for (const line of stack.split("\n")) {
    const m = STACK_LINE.exec(line.trim());
    if (!m) continue;
    const url = m[3] as string;
    if (ownBase && url.split("?")[0] === ownBase) continue;
    return { url, line: Number(m[4]), fn: (m[1] ?? m[2] ?? "").replace(/^Object\./, "") };
  }
  return null;
}

/** Whether a canvas belongs to myaku's own overlay (inside its shadow root). */
function isOverlayCanvas(canvas: unknown): boolean {
  const root = (canvas as { getRootNode?: () => unknown }).getRootNode?.() as { host?: Element } | undefined;
  return Boolean(root?.host?.hasAttribute?.("data-myaku"));
}

/** Whether the page has a canvas outside myaku's overlay. */
function hasGameCanvas(): boolean {
  return typeof document !== "undefined" && document.querySelector("canvas") !== null;
}
