export { adapt, type EngineKind, watchEngines } from "./engines.js";
export type { Cause, Evidence, ScriptEvidence, Verdict } from "./explain.js";
export { explainFrame } from "./explain.js";
export { type Overlay, type OverlayOptions, overlay } from "./overlay.js";
export { type Frame, Profiler, type ProfilerOptions } from "./profiler.js";
export type { Report } from "./report.js";

import { watchEngines } from "./engines.js";
import { Profiler, type ProfilerOptions } from "./profiler.js";

/**
 * Start profiling. Call it before the game creates its canvas context and starts its loop, so every
 * frame and draw call is seen. Calling it again returns the running profiler.
 *
 * ```ts
 * import { myaku, overlay } from "myaku";
 * if (import.meta.env.DEV) overlay(myaku());
 * ```
 */
export function myaku(options?: ProfilerOptions): Profiler {
  const existing = typeof window === "undefined" ? undefined : (window as unknown as { __MYAKU__?: Profiler }).__MYAKU__;
  if (existing) return existing;
  const profiler = new Profiler(options);
  if (options?.engines !== false) profiler.onStop(watchEngines(profiler));
  return profiler;
}
