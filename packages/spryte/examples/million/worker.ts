// One simulation worker: it bins or moves its slice of the flock in shared memory when the page asks.
import { type Buffers, bin, move, type StepParams } from "./sim.js";

let b: Buffers | undefined;

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { buffers?: Buffers; phase?: "bin" | "move"; p: StepParams; start: number; end: number; slot: number };
  if (m.buffers) {
    b = m.buffers;
    return;
  }
  if (!b) return;
  if (m.phase === "bin") bin(b, m.p, m.start, m.end, m.slot);
  else move(b, m.p, m.start, m.end);
  (self as unknown as Worker).postMessage(0);
};
