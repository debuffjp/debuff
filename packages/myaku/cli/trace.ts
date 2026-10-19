/**
 * `myaku record --trace`: read Chromium's own frame pipeline from a CDP trace, and use it to check
 * the in-page profiler. Node only, Chromium only. The in-page profiler never sees any of this.
 *
 * Two sources in the trace:
 * - `PipelineReporter` (devtools.timeline.frame): one per frame Chromium's compositor produced, with
 *   its fate (presented, dropped, or presented without the main thread's update) and its stages.
 * - The GPU process's main thread (`gpu` category): when it was busy running the page's GL commands.
 */
import type { Report, Verdict } from "myaku";

/** Categories to record. Kept small: each one costs time in the browser while recording. */
export const TRACE_CATEGORIES = ["disabled-by-default-devtools.timeline.frame", "blink.user_timing", "gpu"];

/** The `performance.mark` that ties performance.now() to trace time. */
export const SYNC_MARK = "myaku-trace-sync";

/** A `gpu` verdict needs the GPU at least this busy over this many frame budgets before the hitch. */
const PRIOR_FRAMES = 10;
const PRIOR_LOAD = 0.3;

export interface TraceEvent {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  id2?: { local?: string; global?: string };
  id?: string;
  args?: Record<string, unknown>;
}

/** What the trace says about the hitches and frames myaku saw. */
export interface TraceSummary {
  /** Frames the display showed with fresh content from the page. */
  presented: number;
  /** Frames Chromium dropped (produced but never shown). */
  dropped: number;
  /** Time between presented frames, in ms: what reached the screen. Compare with `intervalMs`. */
  presentedMs: { p50: number; p95: number; p99: number; max: number };
  /** myaku hitches the trace confirms: the screen went without a new frame. */
  confirmed: number;
  /** myaku hitches where every display refresh still got a new frame: the player didn't see them. */
  unconfirmed: number;
  /** Presentation gaps longer than the hitch threshold that myaku's hitch list doesn't cover. */
  missed: { at: number; ms: number }[];
  /** `unknown` verdicts the trace turned into `gpu` or `compositor`. */
  reclassified: number;
  /** Average GPU-process busy time per presented frame, in ms. */
  gpuMsPerFrame: number;
  /** How much the trace slowed things down, when measured. */
  notes: string[];
}

interface Pipeline {
  start: number;
  end: number;
  state: string;
  forked: boolean;
  stages: Record<string, number>;
}

/** Pair up `PipelineReporter` begin/end events, and attach the stage events inside each one. */
export function pipelines(events: TraceEvent[], pid: number): Pipeline[] {
  const open = new Map<string, Pipeline & { stageStart: Record<string, number> }>();
  const out: Pipeline[] = [];
  const sorted = events.filter((e) => e.pid === pid && e.cat.includes("devtools.timeline.frame") && (e.ph === "b" || e.ph === "e"));
  sorted.sort((a, b) => a.ts - b.ts);
  for (const e of sorted) {
    const key = e.id2?.local ?? e.id2?.global ?? e.id ?? "";
    if (e.name === "PipelineReporter") {
      if (e.ph === "b") {
        const r = (e.args?.frame_reporter ?? e.args?.chrome_frame_reporter ?? {}) as { state?: string; frame_type?: string };
        open.set(key, { start: e.ts, end: e.ts, state: r.state ?? "", forked: r.frame_type === "FORKED", stages: {}, stageStart: {} });
      } else {
        const p = open.get(key);
        if (!p) continue;
        open.delete(key);
        out.push({ start: p.start, end: e.ts, state: p.state, forked: p.forked, stages: p.stages });
      }
      continue;
    }
    const p = open.get(key);
    if (!p) continue;
    if (e.ph === "b") p.stageStart[e.name] = e.ts;
    else if (p.stageStart[e.name] !== undefined) p.stages[e.name] = (e.ts - (p.stageStart[e.name] ?? e.ts)) / 1000;
  }
  return out;
}

/** Busy intervals (µs) of a thread, merging nested and overlapping complete events. */
export function busy(events: TraceEvent[], pid: number, tid: number): [number, number][] {
  const spans = events
    .filter((e) => e.pid === pid && e.tid === tid && e.ph === "X" && e.dur !== undefined)
    .map((e) => [e.ts, e.ts + (e.dur ?? 0)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const s of spans) {
    const last = out.at(-1);
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

function overlap(spans: [number, number][], a: number, b: number): number {
  let sum = 0;
  for (const [s, e] of spans) if (e > a && s < b) sum += Math.min(e, b) - Math.max(s, a);
  return sum;
}

function threadOf(events: TraceEvent[], name: string): { pid: number; tid: number } | undefined {
  const m = events.find((e) => e.ph === "M" && e.name === "thread_name" && (e.args as { name?: string } | undefined)?.name === name);
  return m && { pid: m.pid, tid: m.tid };
}

/**
 * Check a report's hitches against the trace. `hitches` is the profiler's full hitch list (the
 * report keeps only the worst 10); `startedAt` is performance.now() when the report's frames began.
 * Returns the trace summary and the report with `unknown` verdicts upgraded where the trace shows why.
 */
export function analyze(
  report: Report,
  hitches: Verdict[],
  events: TraceEvent[],
  startedAt: number,
): { report: Report & { trace: TraceSummary }; hitches: Verdict[] } {
  const notes: string[] = [];
  const mark = events.find((e) => e.name === SYNC_MARK);
  const empty = (): { report: Report & { trace: TraceSummary }; hitches: Verdict[] } => ({
    report: {
      ...report,
      trace: {
        presented: 0,
        dropped: 0,
        presentedMs: { p50: 0, p95: 0, p99: 0, max: 0 },
        confirmed: 0,
        unconfirmed: 0,
        missed: [],
        reclassified: 0,
        gpuMsPerFrame: 0,
        notes,
      },
    },
    hitches,
  });
  if (!mark) {
    notes.push("The trace had no sync mark, so it couldn't be lined up with myaku's frames.");
    return empty();
  }
  // Trace time (µs) of performance.now() = 0 in the page.
  const markNow = Number((mark.args?.data as { startTime?: number } | undefined)?.startTime ?? Number.NaN);
  if (!Number.isFinite(markNow)) {
    notes.push("The trace's sync mark had no page time, so it couldn't be lined up with myaku's frames.");
    return empty();
  }
  const origin = mark.ts - markNow * 1000;
  const toTrace = (ms: number) => origin + ms * 1000;
  const toPage = (us: number) => (us - origin) / 1000;
  const from = toTrace(startedAt);

  const all = pipelines(events, mark.pid).filter((p) => p.end >= from);
  // A presentation with fresh content: a non-forked pipeline that presented everything.
  const shown = all.filter((p) => p.state === "STATE_PRESENTED_ALL" && !p.forked);
  const times = [...new Set(shown.map((p) => p.end))].sort((a, b) => a - b);
  const gaps: { start: number; end: number; ms: number }[] = [];
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1] ?? 0;
    const b = times[i] ?? 0;
    gaps.push({ start: a, end: b, ms: (b - a) / 1000 });
  }
  const dropped = all.filter((p) => p.state === "STATE_DROPPED" && !p.forked).length;
  if (!shown.length) notes.push("The trace showed no presented frames: this Chromium may not report its frame pipeline.");

  const gpu = threadOf(events, "CrGpuMain");
  const gpuBusy = gpu ? busy(events, gpu.pid, gpu.tid) : [];
  if (!gpu) notes.push("The trace had no GPU process thread, so GPU time couldn't be measured.");

  const threshold = report.budgetMs * 1.5;
  let confirmed = 0;
  let unconfirmed = 0;
  let reclassified = 0;
  const upgraded = hitches.map((h) => {
    const a = toTrace(h.at);
    const b = toTrace(h.at + h.intervalMs);
    // The screen waited for a new frame somewhere in (or just after) this hitch: rAF delay shows up
    // on the display up to two refreshes later, through the pipeline.
    const slack = report.budgetMs * 2 * 1000;
    const seen = gaps.some((g) => g.ms > threshold && g.end > a && g.start < b + slack);
    if (seen) confirmed++;
    else unconfirmed++;
    if (h.cause !== "unknown") return h;
    // GPU work for this frame can land after rAF's interval ends, so look as far as the pipeline does.
    const gpuMs = Math.min(h.intervalMs, overlap(gpuBusy, a, b + slack) / 1000);
    const inside = all.filter((p) => p.end > a && p.start < b + slack);
    const swapMs = Math.max(0, ...inside.map((p) => p.stages.Swap ?? 0));
    const drawMs = Math.max(0, ...inside.map((p) => p.stages.StartDrawToSwapStart ?? 0));
    const stalled = gpuMs >= h.intervalMs * 0.5 || swapMs >= h.budgetMs;
    // The GPU process serves the whole browser and waits on the OS, so a busy GPU alone doesn't mean
    // this page's drawing. A game that loads the GPU keeps it busy in the frames before too; a lone
    // stall with an idle GPU before it is the driver, the OS or another app.
    const before = PRIOR_FRAMES * h.budgetMs;
    const loadMs = overlap(gpuBusy, a - before * 1000, a) / 1000;
    if (stalled && loadMs < before * PRIOR_LOAD) {
      return {
        ...h,
        summary: `${h.summary} Chrome's trace shows the GPU stalled for ${fmt(Math.max(gpuMs, swapMs))}, but the game had kept it only ${Math.round((loadMs / before) * 100)}% busy just before: more likely the driver, the OS or another app than the game's drawing.`,
        hint: "One-off GPU stalls on a lightly loaded GPU are usually outside the game's control. If they repeat, try another browser or check for other GPU-heavy apps.",
      };
    }
    if (stalled) {
      reclassified++;
      return {
        ...h,
        cause: "gpu" as Verdict["cause"],
        confidence: gpuMs >= h.intervalMs * 0.8 ? ("high" as const) : ("medium" as const),
        summary: `Frame ${h.frame} took ${fmt(h.intervalMs)} (budget ${fmt(h.budgetMs)}). The game's code took only ${fmt(h.evidence.cpuMs)}, but the GPU was busy for ${fmt(gpuMs)}${swapMs >= h.budgetMs ? ` and the swap waited ${fmt(swapMs)}` : ""} (from Chrome's trace).`,
        hint: "Draw less per frame: fewer pixels (lower resolution or fewer full-screen passes), cheaper shaders, fewer overdrawn layers.",
      };
    }
    // The compositor draws on the GPU process too, so only blame it when the GPU itself was mostly idle.
    if (drawMs >= h.budgetMs * 0.5 && gpuMs < h.intervalMs * 0.25) {
      reclassified++;
      return {
        ...h,
        cause: "compositor" as Verdict["cause"],
        confidence: "medium" as const,
        summary: `Frame ${h.frame} took ${fmt(h.intervalMs)} (budget ${fmt(h.budgetMs)}). The game's code took only ${fmt(h.evidence.cpuMs)}; Chrome's compositor spent ${fmt(drawMs)} drawing the page (from Chrome's trace).`,
        hint: "Fewer composited layers over the canvas: DOM UI with transforms, filters, or opacity animations, or a canvas that isn't the page's only big element.",
      };
    }
    return h;
  });

  // Gaps the player saw that myaku's hitch list doesn't cover.
  const missed = gaps
    .filter((g) => g.ms > threshold)
    .filter((g) => !hitches.some((h) => toTrace(h.at + h.intervalMs) + report.budgetMs * 2000 > g.start && toTrace(h.at) < g.end))
    .map((g) => ({ at: round(toPage(g.start)), ms: round(g.ms) }));

  // Fix the report's worst list and cause counts to match.
  const byFrame = new Map(upgraded.map((h) => [h.frame, h]));
  const worst = report.worst.map((w) => byFrame.get(w.frame) ?? w);
  const causes: Report["causes"] = {};
  for (const h of upgraded) causes[h.cause] = (causes[h.cause] ?? 0) + 1;

  const sorted = gaps.map((g) => g.ms).sort((x, y) => x - y);
  const gpuTotal = overlap(gpuBusy, from, times.at(-1) ?? from) / 1000;
  return {
    report: {
      ...report,
      causes,
      worst,
      trace: {
        presented: times.length,
        dropped,
        presentedMs: { p50: pct(sorted, 0.5), p95: pct(sorted, 0.95), p99: pct(sorted, 0.99), max: round(sorted.at(-1) ?? 0) },
        confirmed,
        unconfirmed,
        missed,
        reclassified,
        gpuMsPerFrame: times.length ? round(gpuTotal / times.length) : 0,
        notes,
      },
    },
    hitches: upgraded,
  };
}

function fmt(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0);
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
