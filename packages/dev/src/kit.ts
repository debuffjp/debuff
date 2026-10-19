/**
 * The debuff look for dev UI (house style "squish", the same language as debuff's games):
 * soft round-cornered panels with no outlines, flat colour, lime only for what is on or live,
 * and controls that squash when pressed and spring back.
 * Everything is class-based and scoped under `[data-debuff-kit]`, injected once as a `<style>`.
 */

export const tokens = {
  lime: "#cffb2d",
  sky: "#38bdf8",
  violet: "#a78bfa",
  amber: "#fbbf24",
  pink: "#f472b6",
  red: "#f87171",
  text: "#d3dcc2",
  muted: "#9ca78a",
  ink: "#11140d",
  panel: "rgba(17, 20, 13, 0.95)",
  raised: "#1b2014",
  /** Opaque panel colour, for pieces that must hide what's beneath them. */
  solid: "#161a10",
  line: "#2a3320",
  /** Corner radius of panels, px. Controls are pills. */
  radius: 14,
} as const;

import { DEBUFF_SANS_TTF } from "./debuff-sans-ttf.js";

const STYLE_ID = "debuff-kit-style";

/** A springy curve that overshoots a little: the jelly in every press and toggle. */
const SPRING = "cubic-bezier(.3,1.6,.5,1)";

export function kitCss(): string {
  const t = tokens;
  return `
@font-face{font-family:"debuff sans";src:url(data:font/otf;base64,${DEBUFF_SANS_TTF}) format("opentype");font-display:block}
[data-debuff-kit]{--dk-label:10px/1.4 "debuff sans",ui-monospace,monospace;--dk-lime:${t.lime};--dk-text:${t.text};--dk-muted:${t.muted};--dk-ink:${t.ink};--dk-line:${t.line};--dk-raised:${t.raised};
  border-radius:${t.radius}px;background:${t.panel};box-shadow:0 8px 24px #0006;
  color:#e5e7eb;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;backdrop-filter:blur(4px)}
[data-debuff-kit] .dk-btn{font:var(--dk-label);cursor:pointer;color:var(--dk-lime);background:var(--dk-raised);border:none;padding:3px 9px 1px;
  border-radius:999px;transition:transform 180ms ${SPRING},background 120ms}
[data-debuff-kit] .dk-btn:hover{background:var(--dk-line)}
[data-debuff-kit] .dk-btn:active{transform:scale(1.08,.86);transition-duration:60ms}
[data-debuff-kit] .dk-btn:focus-visible,[data-debuff-kit] .dk-tab:focus-visible,[data-debuff-kit] .dk-input:focus-visible{outline:2px solid var(--dk-lime);outline-offset:1px}
[data-debuff-kit] .dk-btn.dk-proc{animation:dk-proc 320ms ${SPRING}}
@keyframes dk-proc{0%{transform:scale(1)}25%{transform:scale(1.15,.8)}60%{transform:scale(.95,1.06)}100%{transform:scale(1)}}
[data-debuff-kit] .dk-chip,[data-debuff-kit] .dk-label{font:var(--dk-label)}
[data-debuff-kit] label>.dk-label{position:relative;top:2px}
[data-debuff-kit] .dk-chip{--c:var(--dk-lime);color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);padding:2px 8px 0;
  white-space:nowrap;border-radius:999px}
[data-debuff-kit] .dk-input{font:inherit;color:#e7ebe0;background:var(--dk-raised);border:none;padding:1px 6px;border-radius:8px}
[data-debuff-kit] select.dk-input{font:var(--dk-label);appearance:none;cursor:pointer;padding:3px 16px 1px 8px;border-radius:999px;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='5'%3E%3Cpath d='M1 1l2.5 3L6 1' stroke='%23cffb2d' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") right 6px center/7px 5px no-repeat,var(--dk-raised)}
[data-debuff-kit] .dk-tabs{display:inline-flex;gap:2px;padding:3px;margin-bottom:8px;border-radius:999px;background:var(--dk-raised)}
[data-debuff-kit] .dk-tab{font:var(--dk-label);cursor:pointer;color:var(--dk-muted);background:none;border:none;padding:4px 10px 2px;border-radius:999px;
  transition:transform 180ms ${SPRING}}
[data-debuff-kit] .dk-tab:active{transform:scale(1.08,.88)}
[data-debuff-kit] .dk-tab[aria-selected=true]{color:var(--dk-ink);background:var(--dk-lime)}
[data-debuff-kit] .dk-stack{--c:var(--dk-lime);margin:0 0 8px}
[data-debuff-kit] .dk-stack>summary{font:var(--dk-label);list-style:none;cursor:pointer;color:var(--c);font-weight:600;padding:4px 8px 2px;margin:0 0 4px;
  border-radius:999px;background:color-mix(in srgb,var(--c) 10%,transparent)}
[data-debuff-kit] .dk-stack>summary::-webkit-details-marker{display:none}
[data-debuff-kit] .dk-stack>summary::before{content:"";display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:var(--c);
  transform:scale(.6);transition:transform 220ms ${SPRING}}
[data-debuff-kit] .dk-stack[open]>summary::before{transform:scale(1)}
[data-debuff-kit] .dk-stack>:not(summary){margin-left:9px}
[data-debuff-kit] input[type=checkbox].dk-toggle{appearance:none;margin:0;width:22px;height:12px;cursor:pointer;flex:none;position:relative;
  --c:var(--dk-lime);border-radius:999px;background:var(--dk-line);transition:background 120ms}
[data-debuff-kit] input[type=checkbox].dk-toggle::after{content:"";position:absolute;top:2px;left:2px;width:8px;height:8px;border-radius:50%;background:var(--dk-muted);
  transition:left 220ms ${SPRING},background 120ms}
[data-debuff-kit] input[type=checkbox].dk-toggle:checked{background:color-mix(in srgb,var(--c) 35%,transparent)}
[data-debuff-kit] input[type=checkbox].dk-toggle:checked::after{left:12px;background:var(--c)}
[data-debuff-kit] input[type=range].dk-range{appearance:none;--c:var(--dk-lime);--p:50%;height:6px;margin:0;min-width:0;cursor:pointer;border-radius:999px;background:
  linear-gradient(90deg,var(--c) var(--p),var(--dk-line) var(--p))}
[data-debuff-kit] input[type=range].dk-range::-webkit-slider-thumb{appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;border:none;
  box-shadow:0 1px 3px #0008;transition:transform 180ms ${SPRING}}
[data-debuff-kit] input[type=range].dk-range:active::-webkit-slider-thumb{transform:scale(1.3,1.1)}
[data-debuff-kit] input[type=range].dk-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:none;box-shadow:0 1px 3px #0008}
[data-debuff-kit] .dk-card{--c:var(--dk-lime);margin:0 0 6px;padding:6px 9px;border-radius:10px;background:color-mix(in srgb,var(--c) 9%,transparent)}
[data-debuff-kit] .dk-card .dk-chip{background:color-mix(in srgb,var(--c) 24%,transparent)}
@media (prefers-reduced-motion:reduce){[data-debuff-kit] *,[data-debuff-kit] *::before,[data-debuff-kit] *::after{animation:none!important;transition:none!important}}`;
}

/** Inject the kit stylesheet once and mark `root` as kit-styled. */
export function applyKit(root: HTMLElement): void {
  root.setAttribute("data-debuff-kit", "");
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = kitCss();
  document.head.append(style);
}

/** Replay the click squash on a kit button. */
export function proc(b: HTMLElement): void {
  b.classList.remove("dk-proc");
  void b.offsetWidth;
  b.classList.add("dk-proc");
}

/** Keep a `.dk-range` slider's fill in step with its value. Call after setting `value` in code. */
export function fillRange(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const f = max > min ? Math.max(0, Math.min(1, (Number(input.value) - min) / (max - min))) : 0;
  input.style.setProperty("--p", `${f * 100}%`);
}
