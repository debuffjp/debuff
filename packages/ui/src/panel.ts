import type { DrawLike } from "./draw-like.js";

/** A filled box with each corner cut by a `c`px pixel staircase (45°), drawn as a few rects. */
function chamferedRect(draw: DrawLike, x: number, y: number, w: number, h: number, c: number, color: string | number): void {
  const cut = Math.max(0, Math.min(Math.floor(c), Math.floor(w / 2), Math.floor(h / 2)));
  if (cut === 0) {
    draw.rect(x, y, w, h, color);
    return;
  }
  draw.rect(x, y + cut, w, h - cut * 2, color);
  for (let k = 0; k < cut; k++) {
    const inset = cut - k;
    draw.rect(x + inset, y + k, w - inset * 2, 1, color);
    draw.rect(x + inset, y + h - 1 - k, w - inset * 2, 1, color);
  }
}

/** A filled box with round corners of radius `r` (stepped corners when `draw` has no `circle`). */
function roundedRect(draw: DrawLike, x: number, y: number, w: number, h: number, r: number, color: string | number): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rad < 1 || !draw.circle) {
    chamferedRect(draw, x, y, w, h, rad, color);
    return;
  }
  draw.rect(x + rad, y, w - rad * 2, h, color);
  draw.rect(x, y + rad, rad, h - rad * 2, color);
  draw.rect(x + w - rad, y + rad, rad, h - rad * 2, color);
  for (const [cx, cy] of [
    [x + rad, y + rad],
    [x + w - rad, y + rad],
    [x + rad, y + h - rad],
    [x + w - rad, y + h - rad],
  ] as const)
    draw.circle(cx, cy, rad, color);
}

/**
 * A framed box: each colour in `borders` is a 1px ring, outermost first, then `fill` inside.
 * `chamfer` cuts every corner by that many pixels.
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
  chamfer = 0,
  radius = 0,
): void {
  const box = (bx: number, by: number, bw: number, bh: number, c: string | number, r: number) => {
    if (radius > 0) roundedRect(draw, bx, by, bw, bh, r, c);
    else chamferedRect(draw, bx, by, bw, bh, chamfer, c);
  };
  let i = 0;
  for (const c of borders) {
    if (w - i * 2 <= 0 || h - i * 2 <= 0) return;
    box(x + i, y + i, w - i * 2, h - i * 2, c, radius - i);
    i++;
  }
  if (fill !== undefined && w - i * 2 > 0 && h - i * 2 > 0) box(x + i, y + i, w - i * 2, h - i * 2, fill, radius - i);
}

export interface FrameStyle {
  /** 1px rings, outermost first. Default one light ring. */
  borders?: readonly (string | number)[];
  /** Default a dark grey. */
  fill?: string | number;
  /** Space between the innermost ring and the content. Default 6. */
  padding?: number;
  /** Cut each corner by this many pixels. Default 0 (square). */
  chamfer?: number;
  /** Round each corner with this radius (wins over `chamfer`). Default 0, or 10 for debuff's own look. */
  radius?: number;
  /** A hard drop shadow in this colour, offset down-right by `shadowOffset`. Default none. */
  shadow?: string | number;
  /** Default 1. */
  shadowOffset?: number;
}

/**
 * debuff's own look ("squish"): a soft, round-cornered dark panel, no outlines. It's also what you get when
 * a style sets neither `borders` nor `fill`. Spread it into any `FrameStyle` or menu panel style:
 * `menu.drawPanel(draw, cx, cy, { ...debuffFrame, title: "paused" })`.
 */
export const debuffFrame = {
  borders: [],
  fill: "#1b2014",
  radius: 10,
  padding: 10,
} as const satisfies FrameStyle;

/** A style that sets no frame of its own gets debuff's look; one that sets borders or a fill keeps exactly what it set. */
export const frameDefaults = (style: FrameStyle): FrameStyle =>
  style.borders === undefined && style.fill === undefined ? { ...debuffFrame, ...style } : style;

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
  style = frameDefaults(style);
  const borders = style.borders ?? ["#ddd"];
  const inset = borders.length + (style.padding ?? 6);
  const outerW = Math.ceil(w) + inset * 2;
  const outerH = Math.ceil(h) + inset * 2;
  const x = Math.round(cx - outerW / 2);
  const y = Math.round(cy - outerH / 2);
  const chamfer = style.chamfer ?? 0;
  const radius = style.radius ?? 0;
  if (style.shadow !== undefined) {
    const o = style.shadowOffset ?? 1;
    panel(draw, x + o, y + o, outerW, outerH, [], style.shadow, chamfer, radius);
  }
  panel(draw, x, y, outerW, outerH, borders, style.fill ?? "#222", chamfer, radius);
  return { x: x + inset, y: y + inset };
}

export interface BarStyle {
  /** Number of cells. Default 10. */
  segments?: number;
  /** Pixels between cells. Default 1. */
  gap?: number;
  /** Lit cells. Default debuff lime. */
  fill?: string | number;
  /** Unlit cells. Default a dark olive. */
  empty?: string | number;
}

/**
 * A segmented meter (health, cooldowns, charge): `value` from 0 to 1 lights whole cells only, rounded,
 * so it never shows a sliver. Cells are all the same whole-pixel width, so the bar can end up to a few
 * pixels short of `w`; returns the width it used.
 * `bar(draw, 8, 8, 60, 4, hp / maxHp, { segments: 10 })`
 */
export function bar(draw: DrawLike, x: number, y: number, w: number, h: number, value: number, style: BarStyle = {}): number {
  const n = Math.max(1, Math.floor(style.segments ?? 10));
  const gap = Math.max(0, style.gap ?? 1);
  const lit = Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * n);
  const fill = style.fill ?? "#cffb2d";
  const empty = style.empty ?? "#2e3a1c";
  const cell = Math.floor((w - gap * (n - 1)) / n);
  if (cell < 1) return 0;
  for (let i = 0; i < n; i++) draw.rect(x + i * (cell + gap), y, cell, h, i < lit ? fill : empty);
  return n * cell + (n - 1) * gap;
}
