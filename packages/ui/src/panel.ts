import type { DrawLike } from "./draw-like.js";

/**
 * A framed box: each colour in `borders` is a 1px ring, outermost first, then `fill` inside.
 * `panel(draw, 48, 40, 160, 64, ["#c3a6d8", "#1a1020", "#5b3a6e"], "#1a1020")`
 */
export function panel(
  draw: DrawLike,
  x: number,
  y: number,
  w: number,
  h: number,
  borders: readonly (string | number)[],
  fill?: string | number,
): void {
  let i = 0;
  for (const c of borders) {
    if (w - i * 2 <= 0 || h - i * 2 <= 0) return;
    draw.rect(x + i, y + i, w - i * 2, h - i * 2, c);
    i++;
  }
  if (fill !== undefined && w - i * 2 > 0 && h - i * 2 > 0) draw.rect(x + i, y + i, w - i * 2, h - i * 2, fill);
}
