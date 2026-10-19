import { BitmapFont, type Frame } from "@debuffjp/sprig";
import { DEBUFF_SANS, DEBUFF_SANS_EXTRAS } from "./debuff-sans-data.js";

const W = 6;
const H = 9;

let font: BitmapFont | undefined;

/**
 * debuff sans, the built-in pixel font and the default for `draw.text`: printable ASCII plus · × … ° ← ↑ → ↓ ♥ ★, 5x7 capitals
 * with descenders, proportional. It's white, so `color` tints it. Built on first use from ~1 kB of data.
 *
 * ```ts
 * draw.text("LV 3", 4, 4); // debuff sans
 * draw.text("LV 3", 4, 4, { font: debuffSans(), color: "#cffb2d" });
 * ```
 */
export function debuffSans(): BitmapFont {
  if (font) return font;
  const count = DEBUFF_SANS.length / 10;
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W * count, H) : document.createElement("canvas");
  canvas.width = W * count;
  canvas.height = H;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  const pixels = ctx?.createImageData?.(W * count, H);
  const frames: Frame[] = [];
  const widths: number[] = [];
  for (let i = 0; i < count; i++) {
    widths.push(Number(DEBUFF_SANS[i * 10]));
    for (let y = 0; y < H; y++) {
      const bits = Number.parseInt(DEBUFF_SANS[i * 10 + 1 + y] as string, 32);
      for (let x = 0; x < 5; x++)
        if (bits & (16 >> x) && pixels)
          pixels.data.fill(255, ((y * W * count + i * W + x) * 4) | 0, ((y * W * count + i * W + x) * 4 + 4) | 0);
    }
    frames.push({ image: canvas, x: i * W, y: 0, w: W, h: H });
  }
  if (ctx && pixels) ctx.putImageData(pixels, 0, 0);
  font = new BitmapFont({ frames, chars: BitmapFont.ASCII + DEBUFF_SANS_EXTRAS, widths, spaceWidth: 3, lineHeight: H + 2 });
  return font;
}
