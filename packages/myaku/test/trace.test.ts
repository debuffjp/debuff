import { describe, expect, it } from "vitest";
import { analyze, busy, pipelines, SYNC_MARK, type TraceEvent } from "../cli/trace.js";
import type { Report, Verdict } from "../src/index.js";

const PID = 1;
const GPU = 2;
const FRAME = "cc,benchmark,disabled-by-default-devtools.timeline.frame";
// Page time 0 is trace time 1,000,000 µs.
const ORIGIN = 1_000_000;
const us = (ms: number) => ORIGIN + ms * 1000;

/** One pipeline: a reporter with a draw and a swap stage, presented (or not) at `end` ms. */
function pipeline(id: string, start: number, end: number, state: string, stages: { draw?: number; swap?: number } = {}, forked = false) {
  const ev: TraceEvent[] = [
    {
      name: "PipelineReporter",
      cat: FRAME,
      ph: "b",
      ts: us(start),
      pid: PID,
      tid: 1,
      id2: { local: id },
      args: { frame_reporter: { state, ...(forked ? { frame_type: "FORKED" } : {}) } },
    },
  ];
  let t = start;
  for (const [name, ms] of [
    ["StartDrawToSwapStart", stages.draw],
    ["Swap", stages.swap],
  ] as const) {
    if (ms === undefined) continue;
    ev.push({ name, cat: FRAME, ph: "b", ts: us(t), pid: PID, tid: 1, id2: { local: id } });
    t += ms;
    ev.push({ name, cat: FRAME, ph: "e", ts: us(t), pid: PID, tid: 1, id2: { local: id } });
  }
  ev.push({ name: "PipelineReporter", cat: FRAME, ph: "e", ts: us(end), pid: PID, tid: 1, id2: { local: id } });
  return ev;
}

const base: TraceEvent[] = [
  { name: SYNC_MARK, cat: "blink.user_timing", ph: "I", ts: us(100), pid: PID, tid: 3, args: { data: { startTime: 100 } } },
  { name: "thread_name", cat: "__metadata", ph: "M", ts: 0, pid: GPU, tid: 9, args: { name: "CrGpuMain" } },
];

/** Presented frames every 16.7 ms, except a gap from 200 to 250 ms with one dropped frame. */
function frames(stagesAt200: { draw?: number; swap?: number } = {}) {
  const ev: TraceEvent[] = [...base];
  const shown = [150, 166.7, 183.3, 200, 250, 266.7, 283.3];
  for (const [i, t] of shown.entries()) ev.push(...pipeline(`0x${i}`, t - 33.3, t, "STATE_PRESENTED_ALL", t === 250 ? stagesAt200 : {}));
  // A forked partial pipeline each refresh is normal and must not count as a presented frame.
  ev.push(...pipeline("0xf", 216.7, 233.3, "STATE_PRESENTED_PARTIAL", {}, true));
  ev.push(...pipeline("0xd", 200, 216.7, "STATE_DROPPED"));
  return ev;
}

const verdict = (frame: number, at: number, intervalMs: number, cause: Verdict["cause"]): Verdict =>
  ({
    frame,
    at,
    intervalMs,
    budgetMs: 16.7,
    cause,
    confidence: "low",
    summary: "",
    hint: "",
    evidence: { cpuMs: 1, draws: 10, uploads: 0, uploadBytes: 0, compiles: 0, heapDropBytes: 0, layoutMs: 0, scripts: [], spans: {} },
  }) as Verdict;

const report = (worst: Verdict[]) => ({ budgetMs: 16.7, worst, causes: {} }) as unknown as Report;

describe("myaku record --trace", () => {
  it("pairs pipeline reporters with their stages, even when ids interleave", () => {
    const p = pipelines(
      [...pipeline("0x1", 0, 30, "STATE_PRESENTED_ALL", { draw: 4, swap: 2 }), ...pipeline("0x2", 16, 46, "STATE_DROPPED")],
      PID,
    );
    expect(p).toHaveLength(2);
    expect(p.find((x) => x.state === "STATE_PRESENTED_ALL")?.stages).toEqual({ StartDrawToSwapStart: 4, Swap: 2 });
  });

  it("merges nested GPU tasks into busy time", () => {
    const x = (ts: number, dur: number): TraceEvent => ({ name: "t", cat: "gpu", ph: "X", ts, dur, pid: GPU, tid: 9 });
    expect(busy([x(0, 10), x(2, 3), x(8, 4), x(20, 1)], GPU, 9)).toEqual([
      [0, 12],
      [20, 21],
    ]);
  });

  it("confirms hitches the screen saw, flags ones it didn't, and finds gaps myaku missed", () => {
    const seen = verdict(10, 195, 45, "script");
    const unseen = verdict(20, 266.7, 30, "script");
    const { report: r } = analyze(report([seen, unseen]), [seen, unseen], frames(), 100);
    expect(r.trace.presented).toBe(7);
    expect(r.trace.dropped).toBe(1);
    expect(r.trace.presentedMs.max).toBe(50);
    expect(r.trace.confirmed).toBe(1);
    expect(r.trace.unconfirmed).toBe(1);
    expect(r.trace.missed).toEqual([]);

    const none = analyze(report([]), [], frames(), 100).report.trace;
    expect(none.missed).toEqual([{ at: 200, ms: 50 }]);
  });

  const gpuTask = (at: number, ms: number): TraceEvent => ({
    name: "task",
    cat: "gpu",
    ph: "X",
    ts: us(at),
    dur: ms * 1000,
    pid: GPU,
    tid: 9,
  });

  it("turns unknown into gpu when the game kept the GPU busy before and through the hitch", () => {
    const h = verdict(10, 195, 45, "unknown");
    // Ten frames before the hitch at 10 ms of GPU work each, then busy through it.
    const load = Array.from({ length: 10 }, (_, i) => gpuTask(195 - 167 + i * 16.7, 10));
    const ev = [...frames(), ...load, gpuTask(196, 44)];
    const { report: r, hitches } = analyze(report([h]), [h], ev, 100);
    expect(hitches[0]?.cause).toBe("gpu");
    expect(hitches[0]?.confidence).toBe("high");
    expect(r.worst[0]?.cause).toBe("gpu");
    expect(r.causes).toEqual({ gpu: 1 });
    expect(r.trace.reclassified).toBe(1);
  });

  it("doesn't blame the game for a lone GPU stall on an idle GPU", () => {
    const h = verdict(10, 195, 45, "unknown");
    const { report: r, hitches } = analyze(report([h]), [h], [...frames(), gpuTask(196, 44)], 100);
    expect(hitches[0]?.cause).toBe("unknown");
    expect(hitches[0]?.summary).toMatch(/driver, the OS or another app/);
    expect(r.trace.reclassified).toBe(0);
  });

  it("turns unknown into compositor when drawing was slow but the GPU idle", () => {
    const h = verdict(10, 195, 45, "unknown");
    const { hitches } = analyze(report([h]), [h], frames({ draw: 20 }), 100);
    expect(hitches[0]?.cause).toBe("compositor");
  });

  it("leaves unknown alone when the trace shows nothing busy, and keeps other causes", () => {
    const u = verdict(10, 195, 45, "unknown");
    const s = verdict(11, 240, 30, "gc");
    const { hitches, report: r } = analyze(report([u, s]), [u, s], frames(), 100);
    expect(hitches.map((h) => h.cause)).toEqual(["unknown", "gc"]);
    expect(r.trace.reclassified).toBe(0);
  });

  it("says so when the trace can't be lined up", () => {
    const { report: r } = analyze(
      report([]),
      [],
      frames().filter((e) => e.name !== SYNC_MARK),
      100,
    );
    expect(r.trace.notes[0]).toMatch(/sync mark/);
  });
});
