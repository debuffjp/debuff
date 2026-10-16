import { vi } from "vitest";

/**
 * happy-dom has neither WebGL2 nor a 2D canvas. This returns null for "webgl2" (so `Game` falls back
 * to its Canvas 2D backend) and a call-recording 2D stand-in. The WebGL2 path is covered end to end
 * by the template's browser scenario.
 */
export function fakeCanvas(): { canvas: HTMLCanvasElement; ctx: Record<string, unknown> & { calls: string[] } } {
  const canvas = document.createElement("canvas");
  const calls: string[] = [];
  const record =
    (name: string) =>
    (..._args: unknown[]) => {
      calls.push(name);
    };
  const ctx = {
    calls,
    canvas,
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    setTransform: record("setTransform"),
    fillRect: record("fillRect"),
    clearRect: record("clearRect"),
    drawImage: record("drawImage"),
    save: record("save"),
    restore: record("restore"),
    translate: record("translate"),
    scale: record("scale"),
    rotate: record("rotate"),
  };
  vi.spyOn(canvas, "getContext").mockImplementation(((type: string) =>
    type === "2d" ? ctx : null) as unknown as typeof canvas.getContext);
  return { canvas, ctx };
}
