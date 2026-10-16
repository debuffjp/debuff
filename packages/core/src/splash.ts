import type { Draw } from "./render/draw.js";

export interface SplashOptions {
  /** Seconds on screen before the game starts. Any key, click or tap skips it. Default 1.6. */
  duration?: number;
}

const LIME = "#cffb2d";
const LIME_SOFT = "#e7fd96";
const INK = "#11140d";
const MUTED = "#9aa58a";
const SKY = "#38bdf8";

/** buff, the debuff mascot, as pixel rows (same art as the CLI): L lime, H highlight, K ink. */
const BUFF = [".LLLLLL.", "LHHHHHHL", "LLKLLKLL", "LLKLLKLL", "LLLLLLLL", ".LLLLLL."];
/** Mid-blink, the top row of each eye closes. */
const BUFF_BLINK = [".LLLLLL.", "LHHHHHHL", "LLLLLLLL", "LLKLLKLL", "LLLLLLLL", ".LLLLLL."];
const PIXEL: Record<string, string | undefined> = { L: LIME, H: LIME_SOFT, K: INK };

/**
 * The "made with debuff" card shown when a game starts. Drawn with `draw` (no DOM, fonts or assets),
 * scaled to the game's logical size. `t` runs from 0 to 1 over the card's life.
 */
export function drawSplash(draw: Draw, width: number, height: number, t: number, reducedMotion: boolean): void {
  const unit = Math.min(width, height) / 90;
  const fade = Math.min(1, t * 6, (1 - t) * 6);
  draw.rect(0, 0, width, height, INK);
  draw.alpha = Math.max(0, fade);

  const cx = width / 2;
  const px = Math.max(1, Math.round(2 * unit));
  const small = Math.max(6, Math.round(6 * unit));
  const big = Math.round(small * 1.7);
  // One centred stack: buff, "made with", the wordmark. Height ≈ icon + gap + both lines.
  const stack = 6 * px + 5 * unit + small * 1.3 + big;
  const top = (height - stack) / 2;

  // buff hops once and blinks.
  const hop = reducedMotion ? 0 : Math.max(0, Math.sin(Math.min(1, t * 2.2) * Math.PI)) * 4 * unit;
  const rows = !reducedMotion && t > 0.55 && t < 0.6 ? BUFF_BLINK : BUFF;
  const left = Math.round(cx - 4 * px);
  const iconTop = Math.round(top - hop);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PIXEL[row[x] ?? "."];
      if (color) draw.rect(left + x * px, iconTop + y * px, px, px, color);
    }
  });

  const textTop = top + 6 * px + 5 * unit;
  draw.text("made with", cx, textTop, { font: `${small}px system-ui, sans-serif`, color: MUTED, align: "center", baseline: "top" });
  draw.text("debuff", cx, textTop + small * 1.3, {
    font: `800 ${big}px Outfit, system-ui, sans-serif`,
    color: LIME,
    align: "center",
    baseline: "top",
  });
  draw.text("debuff.jp", cx, height - 4 * unit, {
    font: `${Math.max(6, Math.round(5 * unit))}px system-ui, sans-serif`,
    color: SKY,
    align: "center",
    baseline: "bottom",
  });
  draw.alpha = 1;
}
