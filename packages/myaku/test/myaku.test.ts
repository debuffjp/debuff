import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Evidence, explainFrame, type Frame, myaku, overlay, Profiler } from "../src/index.js";

const MB = 1024 * 1024;
const frame = (over: Partial<Frame> = {}): Frame => ({
  index: 10,
  at: 1000,
  intervalMs: 40,
  cpuMs: 2,
  draws: 50,
  uploads: 0,
  uploadBytes: 0,
  compiles: 0,
  heapDropBytes: 0,
  spans: {},
  ...over,
});
const evidence = (over: Partial<Evidence> = {}): Evidence => ({
  scripts: [],
  layoutMs: 0,
  stallMs: 0,
  hidden: false,
  attribution: true,
  ...over,
});

describe("explainFrame", () => {
  it("names the script, with its location, when Long Animation Frames attributes it", () => {
    const v = explainFrame(
      frame({ cpuMs: 30 }),
      evidence({
        scripts: [
          { ms: 28, source: "http://localhost:5173/src/enemies.ts?t=1", fn: "spawnWave", char: 120, invoker: "FrameRequestCallback" },
          { ms: 2, source: "http://localhost:5173/src/main.ts", fn: "", char: -1, invoker: "FrameRequestCallback" },
        ],
      }),
      25,
    );
    expect(v.cause).toBe("script");
    expect(v.confidence).toBe("high");
    expect(v.summary).toContain("`spawnWave` in src/enemies.ts, plus 1 more");
    expect(v.where).toEqual({ source: "http://localhost:5173/src/enemies.ts?t=1", fn: "spawnWave", char: 120 });
    expect(v.hint).toMatch(/game loop/);
  });

  it("recognises uploads, compiles, GC, layout and hidden tabs", () => {
    expect(explainFrame(frame({ uploads: 3, uploadBytes: 12 * MB }), evidence(), 25)).toMatchObject({
      cause: "upload",
      confidence: "high",
    });
    expect(explainFrame(frame({ compiles: 2, cpuMs: 20 }), evidence(), 25)).toMatchObject({ cause: "compile", confidence: "high" });
    expect(explainFrame(frame({ heapDropBytes: 16 * MB }), evidence(), 25)).toMatchObject({ cause: "gc", confidence: "high" });
    expect(explainFrame(frame(), evidence({ layoutMs: 20 }), 25).cause).toBe("layout");
    expect(explainFrame(frame({ intervalMs: 3000 }), evidence({ hidden: true }), 25).cause).toBe("hidden");
  });

  it("falls back to frame code time and spans, then admits when it doesn't know", () => {
    const slow = explainFrame(frame({ cpuMs: 30, spans: { physics: 22, render: 6 } }), evidence({ attribution: false }), 25);
    expect(slow).toMatchObject({ cause: "script", confidence: "low" });
    expect(slow.summary).toContain("Spans: physics 22 ms, render 6.0 ms");
    expect(explainFrame(frame({ intervalMs: 16 }), evidence(), 25)).toMatchObject({ cause: "ok", hint: "Nothing to fix here." });
    const unknown = explainFrame(frame(), evidence(), 25);
    expect(unknown).toMatchObject({ cause: "unknown", confidence: "low" });
    expect(explainFrame(frame({ draws: 5000 }), evidence(), 25).summary).toMatch(/5000 draw calls/);
    expect(explainFrame(frame(), evidence({ attribution: false }), 25).hint).toMatch(/Try Chrome/);
  });
});

describe("Profiler", () => {
  let callbacks: FrameRequestCallback[] = [];
  let now = 0;
  const realRaf = globalThis.requestAnimationFrame;
  const realNow = performance.now;

  /** Run one browser frame at `t`, spending `cpu` ms in each callback. */
  const tick = (t: number, cpu = 1) => {
    const run = callbacks;
    callbacks = [];
    now = t;
    for (const cb of run) {
      cb(t);
      now += cpu;
    }
  };

  beforeEach(() => {
    callbacks = [];
    now = 0;
    globalThis.requestAnimationFrame = (cb) => callbacks.push(cb);
    performance.now = () => now;
  });
  afterEach(() => {
    (window as unknown as { __MYAKU__?: Profiler }).__MYAKU__?.stop();
    globalThis.requestAnimationFrame = realRaf;
    performance.now = realNow;
  });

  /** A game loop that schedules itself, optionally running `work` each frame. */
  const loop = (work: () => void = () => {}) => {
    const frameFn = () => {
      work();
      requestAnimationFrame(frameFn);
    };
    requestAnimationFrame(frameFn);
  };

  it("measures the display again after a slow start, keeping the fastest rate", () => {
    const p = myaku();
    loop(() => {
      now += 1;
    });
    let t = 0;
    // A GPU-heavy opening at 30 fps, then normal play at 60, then a slow stretch again.
    for (let i = 0; i < 31; i++) {
      t += 1000 / 30;
      tick(t);
    }
    expect(p.displayIntervalMs).toBeCloseTo(1000 / 30);
    for (let i = 0; i < 30; i++) {
      t += 1000 / 60;
      tick(t);
    }
    expect(p.displayIntervalMs).toBeCloseTo(1000 / 60);
    for (let i = 0; i < 60; i++) {
      t += 1000 / 30;
      tick(t);
    }
    expect(p.displayIntervalMs).toBeCloseTo(1000 / 60);
    expect(p.budgetMs).toBeCloseTo(25);
  });

  it("records frames from requestAnimationFrame, measures the display and finds hitches", () => {
    const p = myaku();
    expect(myaku()).toBe(p);
    loop(() => {
      now += 3;
    });
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += i === 45 ? 60 : 1000 / 60;
      tick(t);
    }
    expect(p.length).toBe(59);
    expect(p.displayIntervalMs).toBeCloseTo(1000 / 60);
    expect(p.budgetMs).toBeCloseTo(25);
    expect(p.frame()?.cpuMs).toBeCloseTo(3);
    const hitches = p.hitches();
    expect(hitches).toHaveLength(1);
    expect(hitches[0]?.intervalMs).toBeCloseTo(60);
    const report = p.report();
    expect(report).toMatchObject({ hitches: 1, displayIntervalMs: 16.67 });
    expect(report.intervalMs.p50).toBeCloseTo(16.67);
    expect(report.intervalMs.max).toBeCloseTo(60);
    expect(report.worst[0]?.cause).toBe("unknown");
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("counts a frame whose own code overran as a hitch, even when the next timestamp is on time", () => {
    const p = myaku();
    let n = 0;
    loop(() => {
      n++;
      now += n === 40 ? 31 : 2; // 31 ms of game code in one frame
    });
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += 1000 / 60; // Chrome keeps stamping frames on the grid
      tick(t);
    }
    const hitches = p.hitches();
    expect(hitches).toHaveLength(1);
    expect(hitches[0]?.intervalMs).toBeCloseTo(31);
    expect(hitches[0]?.cause).toBe("script");
  });

  it("times named spans and restores everything on stop", () => {
    const p = new Profiler({ budgetMs: 20 });
    loop(() => {
      p.span("physics", () => {
        now += 4;
      });
      const end = p.begin("render");
      now += 2;
      end();
    });
    for (let i = 1; i <= 15; i++) tick(i * 16);
    expect(p.frame()?.spans).toEqual({ physics: 4, render: 2 });
    expect(p.report().spans).toEqual({ physics: 4, render: 2 });
    expect(p.subscribe(() => {})).toBeTypeOf("function");
    p.stop();
    expect((window as unknown as { __MYAKU__?: Profiler }).__MYAKU__).toBeUndefined();
  });

  it("counts draw calls, uploads and compiles on WebGL and 2D contexts", () => {
    const drawArrays = vi.fn();
    const fake = {
      drawArrays,
      drawElements: vi.fn(),
      texImage2D: vi.fn(),
      bufferData: vi.fn(),
      compileShader: vi.fn(),
      linkProgram: vi.fn(),
    };
    const proto = HTMLCanvasElement.prototype as unknown as { getContext: (kind: string) => unknown };
    const original = proto.getContext;
    proto.getContext = function (kind: string) {
      return kind === "webgl2" ? fake : original.call(this, kind);
    };
    try {
      const p = new Profiler();
      const gl = document.createElement("canvas").getContext("webgl2") as unknown as typeof fake;
      loop(() => {
        gl.drawArrays();
        gl.drawElements();
        gl.texImage2D(0, 0, 0, 0, 0, { width: 512, height: 512 });
        gl.bufferData(0, new Float32Array(256));
        gl.compileShader();
        gl.linkProgram();
      });
      tick(16);
      tick(32);
      expect(p.frame()).toMatchObject({ draws: 2, uploads: 2, uploadBytes: 512 * 512 * 4 + 1024, compiles: 2 });
      expect(drawArrays).toHaveBeenCalledTimes(2);
      p.stop();
    } finally {
      proto.getContext = original;
    }
  });

  it("warns when it can't see frames, contexts, every span or the heap", () => {
    const memory = { usedJSHeapSize: 50_000_000 };
    (performance as unknown as { memory?: typeof memory }).memory = memory;
    try {
      const p = new Profiler({ budgetMs: 20 });
      expect(p.warnings()).toEqual([]);
      now = 3000;
      expect(p.warnings()[0]).toMatch(/No frames recorded/);
      document.body.appendChild(document.createElement("canvas"));
      loop(() => {
        for (let i = 0; i < 20; i++) p.addSpan(`system${i}`, 1);
      });
      // A heap that never changes: reported too coarsely to see GC.
      for (let i = 1; i <= 150; i++) tick(3000 + i * 16);
      const warnings = p.warnings();
      expect(warnings.some((w) => /No canvas context seen/.test(w))).toBe(true);
      expect(warnings.some((w) => /under "other"/.test(w))).toBe(true);
      expect(warnings.some((w) => /too coarsely/.test(w))).toBe(true);
      expect(p.support.heap).toBe(false);
      expect(p.frame()?.spans.other).toBe(5);
      expect(Object.keys(p.frame()?.spans ?? {})).toHaveLength(16);
      expect(p.report().warnings).toEqual(warnings);
      expect(explainFrame(frame(), { ...evidence(), heap: false }, 25).summary).toMatch(/can't be ruled out/);
      p.stop();
    } finally {
      delete (performance as unknown as { memory?: unknown }).memory;
      document.querySelector("canvas")?.remove();
    }
  });

  it("shows an overlay with a frame graph and explains the frame you click", () => {
    const p = new Profiler({ budgetMs: 20 });
    const o = overlay(p, { corner: "bottom-left" });
    loop();
    for (let i = 1; i <= 20; i++) tick(i * 16 + (i === 10 ? 40 : 0));
    const root = o.element.shadowRoot as ShadowRoot;
    expect(o.element.style.cssText).toContain("bottom");
    (root.querySelector("canvas") as HTMLCanvasElement).dispatchEvent(new MouseEvent("click", { clientX: 230 }));
    expect(root.querySelector(".verdict")?.textContent).toMatch(/took/);
    o.toggle(false);
    expect(o.element.hidden).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM", altKey: true }));
    expect(o.element.hidden).toBe(false);
    o.destroy();
    expect(document.querySelector("[data-myaku]")).toBeNull();
    p.stop();
  });
});
