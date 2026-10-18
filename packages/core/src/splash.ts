import type { Draw } from "./render/draw.js";

export interface SplashOptions {
  /** Seconds on screen before the game starts. Any key, click or tap skips it. Default 1.6. */
  duration?: number;
}

const LIME = "#cffb2d";
const INK = "#11140d";
const MUTED = "#9aa58a";
const STRIPE = "#1c2314";

/** The DEBUFF logo as SVG path data in a 1000×393 box: black outline, white letters, lime swoosh. */
const LOGO_W = 1000;
const LOGO_H = 393;
const LOGO: [string, string][] = [
  [
    "#000",
    "M57 21L132 144L19 372L317 333L620 291L626 290L527 317L559 312L522 322L815 278L836 275L954 235L890 246L960 230L924 234L968 225L941 105L319 50L317 50L322 65Z",
  ],
  [
    "#fff",
    "M97 42L173 126L145 300L233 289L367 245L367 121L325 81ZM362 71L361 71L378 109L378 281L496 268L494 211L444 215L444 199L485 196L483 151L442 150L442 135L491 137L488 81ZM501 82L499 82L507 267L623 256L641 238L637 188L606 170L634 153L631 105L615 91ZM647 93L639 94L651 241L667 254L757 244L768 231L752 102L703 98L713 205L701 206L691 98ZM765 103L760 102L778 241L825 236L820 196L849 193L845 159L815 158L814 147L848 147L842 109ZM852 110L850 112L868 231L914 225L909 193L935 191L935 189L929 161L903 160L901 150L935 150L928 116ZM560 130L561 156L577 145L576 134ZM252 151L240 234L287 206L290 174ZM563 193L564 223L581 219L580 201ZM958 230L820 252L669 281L526 317L852 254Z",
  ],
  [LIME, "M138 172L46 354L463 299L745 258L119 314Z"],
];

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
      ctx.scale(width / LOGO_W, width / LOGO_W);
      for (const [color, d] of LOGO) {
        ctx.fillStyle = color;
        ctx.fill(new Path2D(i ? d.replace(/\d+/g, (n) => String(+n + nudge())) : d), "evenodd");
      }
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

  draw.text("made with", cx, top, { font: `${small}px system-ui, sans-serif`, color: MUTED, align: "center", baseline: "top" });

  // The logo punches in (a quick overshoot), then boils at ~8 frames a second like hand-drawn animation.
  const k = reducedMotion ? 1 : Math.min(1, t * 5);
  const punch = 1 + 0.25 * (1 - k) * (1 - k) - 0.06 * Math.sin(k * Math.PI);
  const scale = draw.renderScale;
  const logo = logoFrame(Math.round(logoW * scale), reducedMotion ? 0 : Math.floor(performance.now() / 120) % 3);
  draw.sprite(logo, cx, logoY, { scaleX: punch / scale, scaleY: punch / scale, smooth: true });
  draw.alpha = 1;
}
