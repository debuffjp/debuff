import type { Draw } from "./render/draw.js";

export interface SplashOptions {
  /** Seconds on screen before the game starts. Any key, click or tap skips it. Default 1.6. */
  duration?: number;
}

const LIME = "#cffb2d";
const INK = "#0d1208";

/**
 * The "made with debuff" card shown when a game starts. Drawn with `draw` (no DOM, fonts or assets),
 * scaled to the game's logical size. `t` runs from 0 to 1 over the card's life.
 */
export function drawSplash(draw: Draw, width: number, height: number, t: number, reducedMotion: boolean): void {
  const unit = Math.min(width, height) / 90;
  const fade = Math.min(1, t * 6, (1 - t) * 6);
  draw.rect(0, 0, width, height, INK);
  draw.alpha = Math.max(0, fade);

  // buff: a lime rectangle with eyes, hopping once.
  const hop = reducedMotion ? 0 : Math.max(0, Math.sin(Math.min(1, t * 2.2) * Math.PI)) * 6 * unit;
  const squash = reducedMotion ? 1 : 1 + 0.12 * Math.max(0, Math.sin(Math.min(1, t * 2.2 + 0.9) * Math.PI * 2)) * (hop > 0 ? 0 : 1);
  const bw = 16 * unit * squash;
  const bh = (13 * unit) / squash;
  const cx = width / 2;
  const base = height / 2 + 2 * unit;
  draw.rect(cx - bw / 2, base - bh - hop, bw, bh, LIME);
  const blink = !reducedMotion && t > 0.55 && t < 0.6;
  const eyeH = blink ? unit : 3 * unit;
  draw.rect(cx - 4 * unit, base - bh - hop + 4 * unit + (3 * unit - eyeH), 2 * unit, eyeH, INK);
  draw.rect(cx + 2 * unit, base - bh - hop + 4 * unit + (3 * unit - eyeH), 2 * unit, eyeH, INK);

  const size = Math.max(6, Math.round(6 * unit));
  draw.text("made with", cx, base + 6 * unit, {
    font: `${size}px system-ui, sans-serif`,
    color: "#9aa58a",
    align: "center",
    baseline: "top",
  });
  draw.text("debuff", cx, base + 6 * unit + size * 1.25, {
    font: `bold ${Math.round(size * 1.6)}px system-ui, sans-serif`,
    color: LIME,
    align: "center",
    baseline: "top",
  });
  draw.alpha = 1;
}
