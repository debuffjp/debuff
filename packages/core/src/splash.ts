import type { Draw } from "spryte";
import { debuffSans } from "./render/debuff-sans.js";

export interface SplashOptions {
  /** Seconds on screen before the game starts. Any key, click or tap skips it. Default 1.6. */
  duration?: number;
}

const INK = "#11140d";
const MUTED = "#9aa58a";

/** The DEBUFF wordmark: white letters with a thick black outline. Path data in a 866×286 box. */
const LOGO_X = 83;
const LOGO_Y = 28;
const LOGO_W = 866;
const LOGO_H = 286;
const LOGO_STROKE = 22;
const LOGO =
  "M97 42L173 126L145 300L233 289L367 245L367 121L325 81ZM362 71L361 71L378 109L378 281L496 268L494 211L444 215L444 199L485 196L483 151L442 150L442 135L491 137L488 81ZM501 82L499 82L507 267L623 256L641 238L637 188L606 170L634 153L631 105L615 91ZM647 93L639 94L651 241L667 254L757 244L768 231L752 102L703 98L713 205L701 206L691 98ZM765 103L760 102L778 241L825 236L820 196L849 193L845 159L815 158L814 147L848 147L842 109ZM852 110L850 112L868 231L914 225L909 193L935 191L935 189L929 161L903 160L901 150L935 150L928 116ZM560 130L561 156L577 145L576 134ZM252 151L240 234L287 206L290 174ZM563 193L564 223L581 219L580 201Z";

/** Boil frames (the outline redrawn with corners nudged, cycled like hand-drawn animation), rasterised once per size. */
let logoFrames: HTMLCanvasElement[] = [];
let logoWidth = 0;

function logoFrame(width: number, frame: number): HTMLCanvasElement {
  if (width !== logoWidth) {
    logoWidth = width;
    let seed = 7;
    const nudge = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 2 ** 32) * 3.2 - 1.6;
    };
    logoFrames = [0, 1, 2].map((i) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.ceil((width * LOGO_H) / LOGO_W);
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      const k = width / LOGO_W;
      ctx.setTransform(k, 0, 0, k, -LOGO_X * k, -LOGO_Y * k);
      const path = new Path2D(i ? LOGO.replace(/\d+/g, (n) => String(+n + nudge())) : LOGO);
      ctx.lineJoin = "miter";
      ctx.lineWidth = LOGO_STROKE;
      ctx.fillStyle = ctx.strokeStyle = "#000";
      ctx.stroke(path);
      ctx.fill(path);
      ctx.fillStyle = "#fff";
      ctx.fill(path, "evenodd");
      return canvas;
    });
  }
  return logoFrames[frame] as HTMLCanvasElement;
}

const RAY = "#cffb2d";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - (1 - v) * (1 - v);

/** The card itself: sun rays turning behind the logo, scanlines, "made with" and the boiling logo. */
function drawCard(draw: Draw, width: number, height: number, t: number, reducedMotion: boolean): void {
  const unit = Math.min(width, height) / 90;
  const cx = width / 2;
  const small = Math.max(6, Math.round(6 * unit));
  const logoW = Math.min(width * 0.8, 72 * unit);
  const logoH = (logoW * LOGO_H) / LOGO_W;
  const stack = small * 1.6 + logoH;
  const top = (height - stack) / 2;
  const logoY = top + small * 1.6 + logoH / 2;
  draw.rect(0, 0, width, height, INK);

  // Sun rays from behind the logo: long thin bars through its centre, turning slowly.
  const reach = Math.hypot(width, height);
  const alpha = draw.alpha;
  draw.push();
  draw.translate(cx, logoY);
  draw.rotate(reducedMotion ? 0 : t * 0.5);
  for (let i = 0; i < 9; i++) {
    draw.push();
    draw.rotate((i * Math.PI) / 9);
    draw.alpha = alpha * (i % 2 ? 0.05 : 0.09);
    draw.rect(-reach, -3 * unit, reach * 2, 6 * unit, RAY);
    draw.pop();
  }
  draw.pop();
  draw.alpha = alpha;

  // Scanlines, like an old TV, under the words so the logo stays crisp.
  draw.alpha = alpha * 0.12;
  const step = Math.max(2, Math.round(unit * 1.5));
  for (let y = 0; y < height; y += step) draw.rect(0, y, width, step / 2, "#000");
  draw.alpha = alpha;

  // debuff sans, at a whole-number scale so its pixels stay square.
  const textScale = Math.max(1, Math.round(small / 7) - 1);
  draw.push();
  draw.translate(Math.round(cx), Math.round(top));
  draw.scale(textScale);
  draw.text("made with", 0, 0, { font: debuffSans(), color: MUTED, align: "center", baseline: "top" });
  draw.pop();

  // The logo boils at ~8 frames a second like hand-drawn animation.
  const scale = draw.renderScale;
  const logo = logoFrame(Math.round(logoW * scale), reducedMotion ? 0 : Math.floor(performance.now() / 120) % 3);
  draw.sprite(logo, cx, logoY, { scaleX: 1 / scale, scaleY: 1 / scale, smooth: true });
}

/**
 * The "made with debuff" card shown when a game starts, switched on and off like an old TV: a dot of light
 * stretches into a line, the line opens into the picture with a flash, sun rays turn behind the logo, and at
 * the end the picture collapses back to a line and a dot. Drawn with `draw` (no DOM content, fonts or
 * assets), with no links or URLs, so games stay within portal rules. `t` runs from 0 to 1 over the card's
 * life. With reduced motion it fades in and out, and the rays stay still.
 */
export function drawSplash(draw: Draw, width: number, height: number, t: number, reducedMotion: boolean): void {
  draw.rect(0, 0, width, height, "#000");
  if (reducedMotion) {
    draw.alpha = clamp01(Math.min(t * 6, (1 - t) * 6));
    drawCard(draw, width, height, t, true);
    draw.alpha = 1;
    return;
  }
  const cx = width / 2;
  const cy = height / 2;
  const at = (a: number, b: number) => ease(clamp01((t - a) / (b - a)));
  // Opening: line width, then picture height. Closing runs the same in reverse.
  const wide = t < 0.5 ? at(0.03, 0.11) : 1 - at(0.92, 0.97);
  const open = t < 0.5 ? at(0.11, 0.2) : 1 - at(0.86, 0.92);
  const line = Math.max(1, Math.min(width, height) / 90);

  if (open > 0) {
    // The picture is squashed into the opening, then fills the screen.
    const h = height * open;
    draw.clip(0, cy - h / 2, width, h, () => {
      draw.push();
      draw.translate(cx, cy);
      draw.scale(1, Math.max(0.001, open));
      draw.translate(-cx, -cy);
      drawCard(draw, width, height, t, false);
      draw.pop();
    });
    // White flash while the picture opens or closes.
    draw.alpha = (1 - open) * 0.9;
    draw.rect(0, cy - h / 2, width, h, "#fff");
    draw.alpha = 1;
  }
  const glow = 1 - clamp01(open / 0.4);
  if (glow > 0 && wide > 0) {
    // The bright line, with a soft glow either side, fading as the picture opens.
    const w = width * wide;
    draw.alpha = 0.25 * glow;
    draw.rect(cx - w / 2, cy - line * 2, w, line * 4, "#fff");
    draw.alpha = glow;
    draw.rect(cx - w / 2, cy - line / 2, w, line, "#fff");
    draw.alpha = 1;
  }
  // The dot of light at switch-on and switch-off.
  const dot = t < 0.5 ? 1 - at(0.05, 0.11) : at(0.95, 0.99) * (1 - at(0.99, 1));
  if (dot > 0 && open === 0) {
    draw.alpha = dot * 0.35;
    draw.circle(cx, cy, line * 5, "#fff");
    draw.alpha = dot;
    draw.circle(cx, cy, line * 1.6, "#fff");
    draw.alpha = 1;
  }
}
