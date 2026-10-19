import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyze, SYNC_MARK, type TraceEvent } from "../cli/trace.js";
import { type Frame, myaku, type Profiler, type Report, type Verdict } from "../src/index.js";
import { summarize } from "../src/report.js";

const frame = (index: number, at: number, intervalMs: number): Frame => ({
  index,
  at,
  intervalMs,
  cpuMs: 1,
  draws: 0,
  uploads: 0,
  uploadBytes: 0,
  compiles: 0,
  heapDropBytes: 0,
  spans: {},
});
const verdict = (f: Frame, cause: Verdict["cause"]): Verdict =>
  ({
    frame: f.index,
    at: f.at,
    intervalMs: f.intervalMs,
    budgetMs: 25,
    cause,
    confidence: "high",
    summary: "",
    hint: "",
    evidence: { cpuMs: 1, draws: 0, uploads: 0, uploadBytes: 0, compiles: 0, heapDropBytes: 0, layoutMs: 0, scripts: [], spans: {} },
  }) as Verdict;
const meta = {
  budgetMs: 25,
  displayIntervalMs: 1000 / 60,
  overheadMs: 0,
  support: { attribution: true, heap: true, contexts: true },
  warnings: [],
};

describe("summarize", () => {
  it("leaves hidden and throttled frames out of fps, intervals and hitches, and reports them apart", () => {
    const frames: Frame[] = [];
    let at = 0;
    for (let i = 10; i < 610; i++) {
      frames.push(frame(i, at, 1000 / 60));
      at += 1000 / 60;
    }
    const hidden = frame(610, at, 30_000);
    const throttled = frame(611, at + 30_000, 100);
    const real = frame(612, at + 30_100, 60);
    frames.push(hidden, throttled, real);
    const r = summarize(frames, [verdict(hidden, "hidden"), verdict(throttled, "throttled"), verdict(real, "script")], meta);
    expect(r.fps).toBeCloseTo(60, 0);
    expect(r.seconds).toBeCloseTo(10.06, 1);
    expect(r.intervalMs.max).toBe(60);
    expect(r.hitches).toBe(1);
    expect(r.worst.map((w) => w.cause)).toEqual(["script"]);
    expect(r.paused).toEqual({ hiddenFrames: 1, hiddenMs: 30_000, throttledFrames: 1, throttledMs: 100 });
  });

  it("uses nearest-rank percentiles: p99 of 100 frames isn't the max", () => {
    const frames = Array.from({ length: 100 }, (_, i) => frame(10 + i, i * 20, i + 1));
    const r = summarize(frames, [], meta);
    expect(r.intervalMs.p99).toBe(99);
    expect(r.intervalMs.p95).toBe(95);
    expect(r.intervalMs.p50).toBe(50);
    expect(r.intervalMs.max).toBe(100);
  });
});

describe("analyze", () => {
  const PID = 1;
  const FRAME = "cc,benchmark,disabled-by-default-devtools.timeline.frame";
  const us = (ms: number) => 1_000_000 + ms * 1000;
  const shownAt = (id: string, end: number): TraceEvent[] => [
    {
      name: "PipelineReporter",
      cat: FRAME,
      ph: "b",
      ts: us(end - 16.7),
      pid: PID,
      tid: 1,
      id2: { local: id },
      args: { frame_reporter: { state: "STATE_PRESENTED_ALL" } },
    },
    { name: "PipelineReporter", cat: FRAME, ph: "e", ts: us(end), pid: PID, tid: 1, id2: { local: id } },
  ];

  it("ignores presentation gaps after the report was read", () => {
    const ev: TraceEvent[] = [
      { name: SYNC_MARK, cat: "blink.user_timing", ph: "I", ts: us(100), pid: PID, tid: 3, args: { data: { startTime: 100 } } },
    ];
    for (const [i, t] of [150, 166.7, 183.3, 200, 216.7].entries()) ev.push(...shownAt(`0x${i}`, t));
    // Reading the report and stopping the trace stalls the page well after the run ended at 220 ms.
    ev.push(...shownAt("0xa", 400));
    const report = { budgetMs: 25, worst: [], causes: {} } as unknown as Report;
    expect(analyze(report, [], ev, 100).report.trace.missed).toHaveLength(1);
    const t = analyze(report, [], ev, 100, 220).report.trace;
    expect(t.missed).toEqual([]);
    expect(t.presentedMs.max).toBeLessThan(25);
  });
});

describe("Profiler", () => {
  let callbacks: FrameRequestCallback[] = [];
  let now = 0;
  let observed: ((list: { getEntries(): unknown[] }) => void) | undefined;
  const realRaf = globalThis.requestAnimationFrame;
  const realNow = performance.now;
  const realObserver = globalThis.PerformanceObserver;
  const tick = (t: number) => {
    const run = callbacks;
    callbacks = [];
    now = t;
    for (const cb of run) {
      cb(t);
      now += 1;
    }
  };
  const loop = () => {
    const fn = () => requestAnimationFrame(fn);
    requestAnimationFrame(fn);
  };

  beforeEach(() => {
    callbacks = [];
    now = 0;
    globalThis.requestAnimationFrame = (cb) => callbacks.push(cb);
    performance.now = () => now;
    globalThis.PerformanceObserver = class {
      static supportedEntryTypes = ["long-animation-frame"];
      constructor(cb: (list: { getEntries(): unknown[] }) => void) {
        observed = cb;
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof PerformanceObserver;
  });
  afterEach(() => {
    (window as unknown as { __MYAKU__?: Profiler }).__MYAKU__?.stop();
    globalThis.requestAnimationFrame = realRaf;
    performance.now = realNow;
    globalThis.PerformanceObserver = realObserver;
  });

  it("clips Long Animation Frame scripts to the frame they overlap", () => {
    const p = myaku();
    loop();
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += 1000 / 60;
      tick(t);
    }
    // One 30 ms frame, then a 200 ms script that starts 5 ms before it ends.
    const start = t;
    t += 30;
    tick(t);
    for (let i = 0; i < 5; i++) {
      t += 1000 / 60;
      tick(t);
    }
    observed?.({
      getEntries: () => [
        {
          startTime: start + 25,
          duration: 200,
          scripts: [{ startTime: start + 25, duration: 200, sourceURL: "https://x/game.js", invoker: "x" }],
        },
      ],
    });
    const h = p.hitches().find((v) => Math.abs(v.at - start) < 1);
    expect(h?.evidence.scripts[0]?.ms).toBeCloseTo(5);
    expect(h?.cause).not.toBe("script");
  });

  it("warns when the display couldn't be measured", () => {
    const p = myaku();
    loop();
    let t = 0;
    for (let i = 0; i < 90; i++) {
      t += 45;
      tick(t);
    }
    expect(p.displayIntervalMs).toBeUndefined();
    expect(p.warnings().join(" ")).toMatch(/couldn't measure the display/);
  });
});
