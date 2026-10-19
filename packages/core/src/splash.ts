import type { Draw } from "@debuffjp/sprig";

export interface SplashOptions {
  /** Seconds on screen before the game starts. Any key, click or tap skips it. Default 1.6. */
  duration?: number;
}

const INK = "#11140d";
const MUTED = "#9aa58a";
const STRIPE = "#1c2314";

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

/**
 * The "made with debuff" card shown when a game starts: "made with" and the logo on a slanted stripe,
 * scaled to the game's logical size. Drawn with `draw` (no DOM content, fonts or assets), with no links
 * or URLs, so games stay within portal rules. `t` runs from 0 to 1 over the card's life.
 */
export function drawSplash(draw: Draw, width: number, height: number, t: number, reducedMotion: boolean): void {
  const unit = Math.min(width, height) / 90;
  const fade = Math.min(1, t * 6, (1 - t) * 6);
  draw.rect(0, 0, width, height, INK);
  draw.alpha = Math.max(0, fade);

  const cx = width / 2;
  const small = Math.max(6, Math.round(6 * unit));
  const logoW = Math.min(width * 0.8, 72 * unit);
  const logoH = (logoW * LOGO_H) / LOGO_W;
  const stack = small * 1.6 + logoH;
  const top = (height - stack) / 2;
  const logoY = top + small * 1.6 + logoH / 2;

  // A slanted stripe behind the logo, at its angle, so the logo's black outline reads on the dark card.
  draw.push();
  draw.translate(cx, logoY);
  draw.rotate(-0.09);
  draw.rect(-width, -logoH * 0.36, width * 2, logoH * 0.72, STRIPE);
  draw.pop();

  // debuff sans, at a whole-number scale so its pixels stay square.
  const textScale = Math.max(1, Math.round(small / 7) - 1);
  draw.push();
  draw.translate(Math.round(cx), Math.round(top));
  draw.scale(textScale);
  draw.text("made with", 0, 0, { color: MUTED, align: "center", baseline: "top" });
  draw.pop();

  // The logo punches in (a quick overshoot), then boils at ~8 frames a second like hand-drawn animation.
  const k = reducedMotion ? 1 : Math.min(1, t * 5);
  const punch = 1 + 0.25 * (1 - k) * (1 - k) - 0.06 * Math.sin(k * Math.PI);
  const scale = draw.renderScale;
  const logo = logoFrame(Math.round(logoW * scale), reducedMotion ? 0 : Math.floor(performance.now() / 120) % 3);
  draw.sprite(logo, cx, logoY, { scaleX: punch / scale, scaleY: punch / scale, smooth: true });
  draw.alpha = 1;
}
