import type { Verdict } from "./explain.js";
import { type Profiler, WARMUP_FRAMES } from "./profiler.js";

export interface OverlayOptions {
  /** Corner of the page (default `"top-right"`). */
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Parent element (default `document.body`). */
  parent?: HTMLElement;
}

export interface Overlay {
  readonly element: HTMLElement;
  /** Show or hide it (also `Alt+M`). */
  toggle(visible?: boolean): void;
  destroy(): void;
}

const W = 240;
const H = 64;
const CSS = `
:host { all: initial; position: fixed; z-index: 2147483647; font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #e8ebe3; }
.box { background: #11140de6; border: 1px solid #ffffff26; border-radius: 8px; padding: 6px 8px 8px; width: ${W}px; box-shadow: 0 6px 24px #0006; }
.head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.head b { font-weight: 600; }
.dim { color: #8a917f; }
.hitch { color: #ff8a7a; }
canvas { display: block; width: ${W}px; height: ${H}px; cursor: pointer; }
.verdict { margin-top: 6px; white-space: normal; }
.verdict p { margin: 4px 0 0; }
.verdict .tag { display: inline-block; padding: 0 5px; border-radius: 4px; background: #ffffff1a; margin-right: 4px; }
`;

/**
 * A small frame-time graph in a corner of the page. Bars over the budget are hitches; click one to see
 * why it was slow. Lives in a shadow root, so the game's CSS can't reach it.
 */
export function overlay(profiler: Profiler, options: OverlayOptions = {}): Overlay {
  const host = document.createElement("div");
  host.setAttribute("data-myaku", "");
  const corner = options.corner ?? "top-right";
  const [v, h] = corner.split("-") as ["top" | "bottom", "left" | "right"];
  host.style.cssText = `${v}:8px;${h}:8px`;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS}</style><div class="box"><div class="head"><b>myaku</b><span class="fps"></span><span class="p95 dim"></span><span class="hits"></span></div><canvas></canvas><div class="verdict"></div></div>`;
  const canvas = root.querySelector("canvas") as HTMLCanvasElement;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  // No 2D context (some headless environments): the stats and verdicts still work.
  const ctx = canvas.getContext("2d");
  ctx?.scale(dpr, dpr);
  const fpsEl = root.querySelector(".fps") as HTMLElement;
  const p95El = root.querySelector(".p95") as HTMLElement;
  const hitsEl = root.querySelector(".hits") as HTMLElement;
  const verdictEl = root.querySelector(".verdict") as HTMLElement;
  (options.parent ?? document.body).appendChild(host);

  let selected: number | undefined;
  // Hold the graph still while the pointer is over it, so a spike can be clicked.
  let frozen = false;
  canvas.addEventListener("pointerenter", () => {
    frozen = true;
  });
  canvas.addEventListener("pointerleave", () => {
    frozen = false;
  });
  let frameCount = 0;

  const draw = () => {
    if (!ctx) return;
    const n = Math.min(W, profiler.length);
    const budget = profiler.budgetMs;
    const scale = H / (budget * 2.5);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < n; i++) {
      const fr = profiler.frame(i);
      if (!fr) continue;
      const x = W - 1 - i;
      const hgt = Math.min(H, fr.intervalMs * scale);
      const hitch = fr.index >= WARMUP_FRAMES && fr.intervalMs > budget;
      ctx.fillStyle = fr.index === selected ? "#ffffff" : hitch ? "#ff8a7a" : "#8a917f";
      ctx.fillRect(x, H - hgt, 1, hgt);
    }
    const y = H - budget * scale;
    ctx.fillStyle = "#ffffff40";
    ctx.fillRect(0, Math.round(y), W, 1);
  };

  const stats = () => {
    const frames = profiler.frames(120).filter((f) => f.index >= WARMUP_FRAMES);
    if (!frames.length) return;
    const total = frames.reduce((s, f) => s + f.intervalMs, 0);
    const sorted = frames.map((f) => f.intervalMs).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const hitches = frames.filter((f) => f.intervalMs > profiler.budgetMs).length;
    fpsEl.textContent = `${Math.round((frames.length / total) * 1000)} fps`;
    p95El.textContent = `p95 ${p95.toFixed(1)} ms`;
    hitsEl.textContent = hitches ? `${hitches} hitch${hitches > 1 ? "es" : ""}` : "";
    hitsEl.className = hitches ? "hits hitch" : "hits";
  };

  const unsubscribe = profiler.subscribe(() => {
    if (host.hidden || frozen) return;
    draw();
    if (++frameCount % 15 === 0) stats();
  });

  const show = (verdict: Verdict | undefined) => {
    verdictEl.textContent = "";
    if (!verdict) return;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `${verdict.cause} · ${verdict.confidence}`;
    const summary = document.createElement("p");
    summary.textContent = verdict.summary;
    const hint = document.createElement("p");
    hint.className = "dim";
    hint.textContent = verdict.hint;
    verdictEl.append(tag, summary, hint);
  };

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const ago = Math.round(W - 1 - (event.clientX - rect.left));
    // Snap to the slowest frame within a few pixels: spikes are one pixel wide.
    let best = ago;
    for (let i = Math.max(0, ago - 6); i <= ago + 6; i++) {
      if ((profiler.frame(i)?.intervalMs ?? 0) > (profiler.frame(best)?.intervalMs ?? 0)) best = i;
    }
    const verdict = profiler.explain(best);
    selected = verdict?.frame;
    show(verdict);
    draw();
  });

  const onKey = (event: KeyboardEvent) => {
    if (event.altKey && event.code === "KeyM") api.toggle();
  };
  window.addEventListener("keydown", onKey);

  const api: Overlay = {
    element: host,
    toggle(visible = host.hidden !== false) {
      host.hidden = !visible;
    },
    destroy() {
      unsubscribe();
      window.removeEventListener("keydown", onKey);
      host.remove();
    },
  };
  return api;
}
