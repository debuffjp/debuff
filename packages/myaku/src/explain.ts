import type { Frame } from "./profiler.js";

/** What caused a slow frame. */
export type Cause =
  /** Not slow: within the frame budget. */
  | "ok"
  /** The game's own code ran long; `where` says which script when the browser told us. */
  | "script"
  /** Garbage collection: the heap shrank and the game's code wasn't busy. */
  | "gc"
  /** Textures or buffers sent to the GPU mid-play. */
  | "upload"
  /** Shaders compiled or programs linked mid-play. */
  | "compile"
  /** Style recalculation and layout (DOM UI over the canvas, reading layout in a loop). */
  | "layout"
  /** The tab was hidden, so the browser paused frames. Not a problem with the game. */
  | "hidden"
  /** The browser slowed frames down (an occluded or background window, power saving) while the game sat idle. */
  | "throttled"
  /** The game's code was quick; the time went somewhere the browser doesn't report (GPU, compositor, other tabs). */
  | "unknown";

/** Where a script came from, as Long Animation Frames reports it. */
export interface ScriptEvidence {
  ms: number;
  /** The script's URL. */
  source: string;
  /** The function, when the browser knows it. */
  fn: string;
  /** Character offset in the script, or -1. */
  char: number;
  /** Line in the script, when known (from where a frame callback was registered). */
  line?: number;
  /** What called it, e.g. `FrameRequestCallback` or `IMG.onload`. */
  invoker: string;
}

/** What the browser reported about a frame's time, beyond the frame's own counters. */
export interface Evidence {
  /** Scripts that ran during the frame, longest first (Chromium's Long Animation Frames only). */
  scripts: ScriptEvidence[];
  layoutMs: number;
  /** Time covered by long animation frames. */
  stallMs: number;
  /** The tab was hidden at some point during the frame. */
  hidden: boolean;
  /** Frames around this one were slow and idle with no stalls: the browser was throttling. */
  throttled?: boolean;
  /** Whether this browser reports script attribution at all. */
  attribution: boolean;
  /** Whether heap readings are live enough to see garbage collection (missing means yes). */
  heap?: boolean;
}

/** A slow frame, explained. JSON-serialisable. */
export interface Verdict {
  frame: number;
  at: number;
  intervalMs: number;
  budgetMs: number;
  cause: Cause;
  /** How sure the evidence makes us: `low` means read it as a lead, not an answer. */
  confidence: "high" | "medium" | "low";
  /** One sentence: what happened. */
  summary: string;
  /** One sentence: what to try. */
  hint: string;
  /** The script to look at, when known: `src/enemies.ts` › `spawnWave`. */
  where?: { source: string; fn: string; char: number; line?: number };
  evidence: {
    cpuMs: number;
    draws: number;
    uploads: number;
    uploadBytes: number;
    compiles: number;
    heapDropBytes: number;
    layoutMs: number;
    scripts: ScriptEvidence[];
    spans: Record<string, number>;
  };
}

const MB = 1024 * 1024;

/**
 * Explain one frame. Causes are tried from the most specific evidence to the least, and the verdict
 * says so when the evidence is thin rather than guessing.
 */
export function explainFrame(frame: Frame, ev: Evidence, budgetMs: number): Verdict {
  const ms = frame.intervalMs;
  const over = `Frame ${frame.index} took ${fmt(ms)} (budget ${fmt(budgetMs)}).`;
  const top = ev.scripts[0];
  const scriptMs = ev.scripts.reduce((sum, s) => sum + s.ms, 0);
  const spanText = topSpans(frame.spans);
  const base = {
    frame: frame.index,
    at: frame.at,
    intervalMs: ms,
    budgetMs,
    evidence: {
      cpuMs: frame.cpuMs,
      draws: frame.draws,
      uploads: frame.uploads,
      uploadBytes: frame.uploadBytes,
      compiles: frame.compiles,
      heapDropBytes: frame.heapDropBytes,
      layoutMs: ev.layoutMs,
      scripts: ev.scripts.slice(0, 5),
      spans: frame.spans,
    },
  };
  const verdict = (v: Omit<Verdict, keyof typeof base>): Verdict => ({ ...base, ...v });

  if (ms <= budgetMs) {
    return verdict({
      cause: "ok",
      confidence: "high",
      summary: `Frame ${frame.index} took ${fmt(ms)}, within the ${fmt(budgetMs)} budget (${fmt(frame.cpuMs)} of game code).`,
      hint: "Nothing to fix here.",
    });
  }

  if (ev.hidden) {
    return verdict({
      cause: "hidden",
      confidence: "high",
      summary: `${over} The tab was hidden, so the browser paused frames.`,
      hint: "Nothing to fix in the game. Pause the game when the tab is hidden if it shouldn't run on after a long gap.",
    });
  }

  if (ev.throttled && frame.cpuMs < 2 && ev.stallMs === 0) {
    return verdict({
      cause: "throttled",
      confidence: "medium",
      summary: `${over} The game sat idle (${fmt(frame.cpuMs)} of code) across a run of slow frames: the browser was throttling frames.`,
      hint: "Usually the window is hidden behind others, minimised, or in power-saving mode. Bring it to the front to measure real play.",
    });
  }

  if (frame.compiles > 0 && ms - frame.cpuMs < ms * 0.9) {
    return verdict({
      cause: "compile",
      confidence: frame.cpuMs > budgetMs * 0.5 ? "high" : "medium",
      summary: `${over} ${frame.compiles} shader compile${frame.compiles > 1 ? "s" : ""} or program link${frame.compiles > 1 ? "s" : ""} happened during play.`,
      hint: "Compile shaders while loading (warm up materials and effects before the level starts), not the first time they're used.",
    });
  }

  if (frame.uploadBytes >= MB && frame.uploads > 0) {
    return verdict({
      cause: "upload",
      confidence: frame.uploadBytes >= 4 * MB ? "high" : "medium",
      summary: `${over} ${frame.uploads} upload${frame.uploads > 1 ? "s" : ""} sent ${mb(frame.uploadBytes)} to the GPU this frame.`,
      hint: "Create and upload textures in the load step, or spread them over several frames. Reuse textures instead of recreating them (text and canvas textures are common culprits).",
    });
  }

  if (top && scriptMs >= ms * 0.4) {
    const label = scriptLabel(top);
    return verdict({
      cause: "script",
      confidence: "high",
      summary: `${over} ${fmt(top.ms)} was script: ${label}${ev.scripts.length > 1 ? `, plus ${ev.scripts.length - 1} more` : ""}.${spanText}`,
      hint: hintForInvoker(top.invoker),
      where: { source: top.source, fn: top.fn, char: top.char, ...(top.line ? { line: top.line } : {}) },
    });
  }

  if (ev.layoutMs >= ms * 0.3) {
    return verdict({
      cause: "layout",
      confidence: "medium",
      summary: `${over} ${fmt(ev.layoutMs)} went to style and layout.`,
      hint: "Look for DOM changes over the canvas each frame, or code that reads layout (offsetWidth, getBoundingClientRect) right after writing styles.",
    });
  }

  if (frame.heapDropBytes >= MB && frame.cpuMs < ms * 0.6) {
    return verdict({
      cause: "gc",
      confidence: frame.heapDropBytes >= 8 * MB ? "high" : "medium",
      summary: `${over} The heap shrank by ${mb(frame.heapDropBytes)} while the game's code ran only ${fmt(frame.cpuMs)}: garbage collection.`,
      hint: "Allocate less per frame: reuse vectors, arrays and objects (pools), and avoid closures and array methods like map/filter in hot loops.",
    });
  }

  if (frame.cpuMs >= budgetMs * 0.8) {
    return verdict({
      cause: "script",
      confidence: ev.attribution ? "medium" : "low",
      summary: `${over} The game's frame code ran ${fmt(frame.cpuMs)}.${spanText}`,
      hint: spanText
        ? "Start with the slowest span. Profile it in the browser's Performance panel to find the hot function."
        : "Wrap your systems in profiler.span(name, fn) to see which one is slow.",
    });
  }

  const noHeap =
    ev.heap === false ? " Garbage collection can't be ruled out: this browser doesn't report the heap closely enough to see it." : "";
  return verdict({
    cause: "unknown",
    confidence: "low",
    summary: `${over} The game's code took only ${fmt(frame.cpuMs)}, so the time went elsewhere${frame.draws > 2000 ? ` (${frame.draws} draw calls is a lot: the GPU may be the bottleneck)` : ""}.${noHeap}`,
    hint:
      frame.draws > 2000
        ? "Batch draws: fewer textures (use an atlas), fewer state changes, and fewer separate objects."
        : ev.attribution
          ? "This often means GPU work, the compositor, or another tab or app. One-off frames like this are usually outside the game's control."
          : "This browser doesn't report script attribution. Try Chrome for a more specific answer.",
  });
}

function scriptLabel(s: ScriptEvidence): string {
  const file = s.source ? `${shortPath(s.source)}${s.line ? `:${s.line}` : ""}` : "an inline script";
  return s.fn ? `\`${s.fn}\` in ${file}` : file;
}

function hintForInvoker(invoker: string): string {
  if (/FrameRequestCallback|requestAnimationFrame/i.test(invoker)) {
    return "This ran inside the game loop. Profile the function in the Performance panel, or spread the work over several frames.";
  }
  if (/onload|onmessage|Promise|resolve|then/i.test(invoker)) {
    return "This ran in an async callback (a load or a message finishing), not the game loop: process its result in smaller pieces.";
  }
  if (/event|click|key|pointer|touch|mouse/i.test(invoker)) {
    return "This ran in an input handler. Record the input and act on it in the game loop instead of doing the work in the handler.";
  }
  if (/setTimeout|setInterval/i.test(invoker)) return "This ran in a timer. Move it into the game loop or split it across frames.";
  return "Spread the work over several frames, or move it to load time.";
}

function topSpans(spans: Record<string, number>): string {
  const sorted = Object.entries(spans).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return "";
  return ` Spans: ${sorted
    .slice(0, 3)
    .map(([n, v]) => `${n} ${fmt(v)}`)
    .join(", ")}.`;
}

/** `http://localhost:5173/src/enemies.ts?t=123` → `src/enemies.ts`. */
export function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "") || u.host;
  } catch {
    return url;
  }
}

function fmt(ms: number): string {
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
}

function mb(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;
}
