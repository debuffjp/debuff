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

export interface FrameStyle {
  /** 1px rings, outermost first. Default one light ring. */
  borders?: readonly (string | number)[];
  /** Default a dark grey. */
  fill?: string | number;
  /** Space between the innermost ring and the content. Default 6. */
  padding?: number;
}

/**
 * Draw a panel that fits content of `w`×`h` centred on (cx, cy), snapped to whole pixels.
 * Returns the content's top-left, where you draw what goes inside.
 */
export function panelAround(
  draw: DrawLike,
  cx: number,
  cy: number,
  w: number,
  h: number,
  style: FrameStyle = {},
): { x: number; y: number } {
  const borders = style.borders ?? ["#ddd"];
  const inset = borders.length + (style.padding ?? 6);
  const outerW = Math.ceil(w) + inset * 2;
  const outerH = Math.ceil(h) + inset * 2;
  const x = Math.round(cx - outerW / 2);
  const y = Math.round(cy - outerH / 2);
  panel(draw, x, y, outerW, outerH, borders, style.fill ?? "#222");
  return { x: x + inset, y: y + inset };
}
