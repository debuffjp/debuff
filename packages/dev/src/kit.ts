/**
 * The debuff look for dev UI (house style "chamfer"):
 * 45° cut corners, hard ink shadows, lime only for what is on or live, and a short "proc" flash on click.
 * Everything is class-based and scoped under `[data-debuff-kit]`, injected once as a `<style>`.
 */

export const tokens = {
  lime: "#cffb2d",
  sky: "#38bdf8",
  violet: "#a78bfa",
  amber: "#fbbf24",
  pink: "#f472b6",
  red: "#f87171",
  text: "#cfd6c4",
  muted: "#8a9479",
  ink: "#050604",
  panel: "rgba(14, 18, 9, 0.94)",
  raised: "#1d2413",
  line: "#3d4d22",
  /** Corner cut of panels, px. Controls use half. */
  chamfer: 4,
} as const;

/** `clip-path` for a box with each corner cut by `c` px. */
export function chamferPath(c: number): string {
  return `polygon(${c}px 0,calc(100% - ${c}px) 0,100% ${c}px,100% calc(100% - ${c}px),calc(100% - ${c}px) 100%,${c}px 100%,0 calc(100% - ${c}px),0 ${c}px)`;
}

import { debuffSans } from "myaku/debuff-sans";

const STYLE_ID = "debuff-kit-style";

/** The 1px diagonal border lines a clipped box loses at its corners, drawn as backgrounds. */
function cornerLines(c: number, color: string): string {
  const d = c / Math.SQRT2;
  const g = (deg: number, at: string) =>
    `linear-gradient(${deg}deg,transparent ${d - 0.7}px,${color} ${d - 0.7}px ${d + 0.5}px,transparent ${d + 0.5}px) ${at}/${c + 2}px ${c + 2}px no-repeat`;
  return [g(135, "top left"), g(225, "top right"), g(45, "bottom left"), g(315, "bottom right")].join(",");
}

export function kitCss(): string {
  const t = tokens;
  const c = t.chamfer;
  const s = c / 2;
  return `
@font-face{font-family:"${debuffSans.family}";src:${debuffSans.src};font-display:block}
[data-debuff-kit]{--dk-label:10px/1.4 "${debuffSans.family}",ui-monospace,monospace;--dk-lime:${t.lime};--dk-text:${t.text};--dk-muted:${t.muted};--dk-ink:${t.ink};--dk-line:${t.line};--dk-raised:${t.raised};
  clip-path:${chamferPath(c)};background:${cornerLines(c, t.line)},${t.panel};box-shadow:inset 0 0 0 1px ${t.line};
  color:#e5e7eb;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;backdrop-filter:blur(4px)}
[data-debuff-kit] .dk-btn{font:var(--dk-label);cursor:pointer;color:var(--dk-lime);background:var(--dk-raised);border:none;padding:1px 7px;
  clip-path:${chamferPath(s)};box-shadow:inset 0 0 0 1px ${t.lime}55,inset 0 -2px 0 #0007;transition:transform 40ms steps(1)}
[data-debuff-kit] .dk-btn:hover{box-shadow:inset 0 0 0 1px var(--dk-lime),inset 0 -2px 0 #0007}
[data-debuff-kit] .dk-btn:active{transform:translateY(1px);box-shadow:inset 0 0 0 1px var(--dk-lime)}
[data-debuff-kit] .dk-btn:focus-visible,[data-debuff-kit] .dk-tab:focus-visible,[data-debuff-kit] .dk-input:focus-visible{outline:1px solid var(--dk-lime);outline-offset:1px}
[data-debuff-kit] .dk-btn.dk-proc{animation:dk-proc 150ms steps(3)}
@keyframes dk-proc{0%{background:#fff;color:var(--dk-ink)}50%{background:var(--dk-lime);color:var(--dk-ink)}}
[data-debuff-kit] .dk-chip,[data-debuff-kit] .dk-label{font:var(--dk-label)}
[data-debuff-kit] .dk-chip{--c:var(--dk-lime);color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);padding:0 6px;
  white-space:nowrap;clip-path:${chamferPath(s)};box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 45%,transparent)}
[data-debuff-kit] .dk-input{font:inherit;color:#e7ebe0;background:#11160a;border:none;padding:1px 4px;clip-path:${chamferPath(s)};box-shadow:inset 0 0 0 1px ${t.lime}40}
[data-debuff-kit] .dk-tabs{display:flex;gap:2px;border-bottom:1px solid var(--dk-line);margin-bottom:6px}
[data-debuff-kit] .dk-tab{font:var(--dk-label);cursor:pointer;color:var(--dk-muted);background:none;border:none;padding:2px 8px;margin-bottom:-1px}
[data-debuff-kit] .dk-tab[aria-selected=true]{color:var(--dk-lime);background:var(--dk-raised);
  clip-path:polygon(${s}px 0,calc(100% - ${s}px) 0,100% ${s}px,100% 100%,0 100%,0 ${s}px);box-shadow:inset 0 1px 0 var(--dk-lime),inset 1px 0 0 var(--dk-line),inset -1px 0 0 var(--dk-line)}
[data-debuff-kit] .dk-stack{--c:var(--dk-lime);margin:0 0 8px;clip-path:polygon(0 0,100% 0,100% 100%,${c}px 100%,0 calc(100% - ${c}px))}
[data-debuff-kit] .dk-stack>summary{font:var(--dk-label);list-style:none;cursor:pointer;color:var(--c);font-weight:600;padding:1px 6px;margin:0 0 4px;
  border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 9%,transparent)}
[data-debuff-kit] .dk-stack>summary::-webkit-details-marker{display:none}
[data-debuff-kit] .dk-stack>summary::before{content:"▸";display:inline-block;margin-right:6px;transition:transform 60ms steps(2)}
[data-debuff-kit] .dk-stack[open]>summary::before{transform:rotate(90deg)}
[data-debuff-kit] .dk-stack>:not(summary){margin-left:9px}
[data-debuff-kit] input[type=checkbox].dk-toggle{appearance:none;margin:0;width:12px;height:12px;cursor:pointer;flex:none;
  --c:var(--dk-lime);clip-path:${chamferPath(2)};background:repeating-linear-gradient(90deg,var(--dk-line) 0 2px,transparent 2px 4px);box-shadow:inset 0 0 0 1px var(--dk-line)}
[data-debuff-kit] input[type=checkbox].dk-toggle:checked{background:var(--c);box-shadow:inset 0 0 0 2px var(--dk-ink)}
[data-debuff-kit] input[type=range].dk-range{appearance:none;--c:var(--dk-lime);--p:50%;height:8px;margin:0;min-width:0;cursor:pointer;background:
  repeating-linear-gradient(90deg,transparent 0 5px,${t.ink} 5px 6px),
  linear-gradient(90deg,var(--c) var(--p),var(--dk-line) var(--p))}
[data-debuff-kit] input[type=range].dk-range::-webkit-slider-thumb{appearance:none;width:8px;height:8px;background:#fff;transform:rotate(45deg);box-shadow:2px 2px 0 var(--dk-ink)}
[data-debuff-kit] input[type=range].dk-range::-moz-range-thumb{width:8px;height:8px;border:none;border-radius:0;background:#fff;transform:rotate(45deg);box-shadow:2px 2px 0 var(--dk-ink)}
[data-debuff-kit] .dk-card{--c:var(--dk-lime);margin:0 0 6px;padding:5px 7px 5px 9px;background:color-mix(in srgb,var(--c) 8%,transparent);
  border-left:3px solid var(--c);clip-path:polygon(0 0,calc(100% - ${s}px) 0,100% ${s}px,100% 100%,0 100%)}
@media (prefers-reduced-motion:reduce){[data-debuff-kit] *{animation:none!important;transition:none!important}}`;
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

/** Restart the click "proc" flash on a kit button. */
export function proc(b: HTMLElement): void {
  b.classList.remove("dk-proc");
  void b.offsetWidth;
  b.classList.add("dk-proc");
}

/** Keep a `.dk-range` slider's segmented fill in step with its value. Call after setting `value` in code. */
export function fillRange(input: HTMLInputElement): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const p = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
  input.style.setProperty("--p", `${Math.max(0, Math.min(100, p))}%`);
}
