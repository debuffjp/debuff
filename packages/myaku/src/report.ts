import type { Cause, Verdict } from "./explain.js";
import { type Frame, WARMUP_FRAMES } from "./profiler.js";

/** A summary of the frames in the buffer. JSON-serialisable, for tools, agents and CI. */
export interface Report {
  frames: number;
  /** Seconds the frames cover. */
  seconds: number;
  /** Frames per second over the whole stretch. */
  fps: number;
  budgetMs: number;
  displayIntervalMs: number | undefined;
  /** Frame interval percentiles, in ms: what players feel. */
  intervalMs: { p50: number; p95: number; p99: number; max: number };
  /** Frame code time percentiles, in ms: what the game costs. */
  cpuMs: { p50: number; p95: number; max: number };
  hitches: number;
  hitchesPerMinute: number;
  /**
   * Slow frames left out of the interval, fps, seconds and hitch numbers because the browser paused or
   * throttled frames (hidden tab, occluded window), not the game. Counted under `causes` all the same.
   */
  paused: { hiddenFrames: number; hiddenMs: number; throttledFrames: number; throttledMs: number };
  /** How many hitches each cause explains. */
  causes: Partial<Record<Cause, number>>;
  /** The worst hitches, slowest first (up to 10). */
  worst: Verdict[];
  /** Average ms per frame for each span. */
  spans: Record<string, number>;
  /** Averages per frame. */
  perFrame: { draws: number; uploads: number; uploadBytes: number };
  /** myaku's own cost per frame, in ms. */
  overheadMs: number;
  support: { attribution: boolean; heap: boolean; contexts: boolean };
  /** What myaku couldn't see, in plain words. Check this before trusting an empty or quiet report. */
  warnings: string[];
}

export function summarize(
  frames: Frame[],
  hitches: Verdict[],
  meta: { budgetMs: number; displayIntervalMs: number | undefined; overheadMs: number; support: Report["support"]; warnings: string[] },
): Report {
  // Start-up frames (scripts still compiling, assets decoding) aren't play; leave them out.
  // Frames the browser paused or throttled say nothing about the game: keep them out of what players feel.
  const pausedVerdicts = hitches.filter((h) => h.cause === "hidden" || h.cause === "throttled");
  const pausedIdx = new Set(pausedVerdicts.map((h) => h.frame));
  const sum = (cause: Cause) => pausedVerdicts.filter((h) => h.cause === cause).reduce((s, h) => s + h.intervalMs, 0);
  const count = (cause: Cause) => pausedVerdicts.filter((h) => h.cause === cause).length;
  const played = hitches.filter((h) => !pausedIdx.has(h.frame));
  const timed = frames.filter((f) => f.index >= WARMUP_FRAMES && !pausedIdx.has(f.index));
  const intervals = timed.map((f) => f.intervalMs).sort((a, b) => a - b);
  const cpu = timed.map((f) => f.cpuMs).sort((a, b) => a - b);
  const seconds = intervals.reduce((s, v) => s + v, 0) / 1000;
  const causes: Partial<Record<Cause, number>> = {};
  for (const h of hitches) causes[h.cause] = (causes[h.cause] ?? 0) + 1;
  const spans: Record<string, number> = {};
  for (const f of timed) for (const [k, v] of Object.entries(f.spans)) spans[k] = (spans[k] ?? 0) + v;
  for (const k of Object.keys(spans)) spans[k] = round((spans[k] ?? 0) / Math.max(1, timed.length));
  const avg = (pick: (f: Frame) => number) => round(timed.reduce((s, f) => s + pick(f), 0) / Math.max(1, timed.length));
  return {
    frames: timed.length,
    seconds: round(seconds),
    fps: seconds > 0 ? round(timed.length / seconds) : 0,
    budgetMs: round(meta.budgetMs),
    displayIntervalMs: meta.displayIntervalMs === undefined ? undefined : round(meta.displayIntervalMs),
    intervalMs: { p50: pct(intervals, 0.5), p95: pct(intervals, 0.95), p99: pct(intervals, 0.99), max: round(intervals.at(-1) ?? 0) },
    cpuMs: { p50: pct(cpu, 0.5), p95: pct(cpu, 0.95), max: round(cpu.at(-1) ?? 0) },
    hitches: played.length,
    hitchesPerMinute: seconds > 0 ? round((played.length / seconds) * 60) : 0,
    paused: {
      hiddenFrames: count("hidden"),
      hiddenMs: round(sum("hidden")),
      throttledFrames: count("throttled"),
      throttledMs: round(sum("throttled")),
    },
    causes,
    worst: [...played].sort((a, b) => b.intervalMs - a.intervalMs).slice(0, 10),
    spans,
    perFrame: { draws: avg((f) => f.draws), uploads: avg((f) => f.uploads), uploadBytes: avg((f) => f.uploadBytes) },
    overheadMs: round(meta.overheadMs, 3),
    support: meta.support,
    warnings: meta.warnings,
  };
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  // Nearest rank: the smallest value with at least p of the values at or below it.
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return round(sorted[i] ?? 0);
}

function round(v: number, digits = 2): number {
  const m = 10 ** digits;
  return Math.round(v * m) / m;
}
