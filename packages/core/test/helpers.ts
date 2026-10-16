import { vi } from "vitest";

/** happy-dom has no 2D canvas. This records calls on a minimal stand-in context. */
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
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return { canvas, ctx };
}
