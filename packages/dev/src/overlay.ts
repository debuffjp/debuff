import type { Game, NumberParamSpec, ParamValue, Plugin } from "@debuff/core";

export interface DevOverlayOptions {
  /** Key (KeyboardEvent.code) that toggles the overlay. Default "Backquote". */
  toggleKey?: string;
  /** Start visible. Default true. */
  open?: boolean;
  /** Corner to dock to. Default "top-right". */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const LIME = "#a3e635";
/** Accent colours cycled across param groups, for splashes of colour. */
const ACCENTS = ["#a3e635", "#38bdf8", "#f472b6", "#fbbf24", "#a78bfa"];
const OVER_BUDGET = "#f87171";
const HISTORY = 120;

/**
 * Dev-only overlay: frame-time graph and live controls for every `game.params` group.
 * Plain DOM, no dependencies. Use inside `if (import.meta.env.DEV)`.
 */
export function devOverlay(options: DevOverlayOptions = {}): Plugin {
  return {
    name: "dev-overlay",
    install(game) {
      const overlay = new Overlay(game, options);
      return () => overlay.dispose();
    },
  };
}

class Overlay {
  private readonly root: HTMLElement;
  private readonly graph: HTMLCanvasElement;
  private readonly label: HTMLElement;
  private readonly mascot: Buff;
  private readonly paramsBox: HTMLElement;
  private readonly frameTimes = new Float32Array(HISTORY);
  private head = 0;
  private lastFrame = performance.now();
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly cleanups: (() => void)[] = [];
  private knownGroups = "";

  constructor(
    private readonly game: Game,
    options: DevOverlayOptions,
  ) {
    this.root = el("div", { "data-debuff-overlay": "" });
    Object.assign(this.root.style, panelStyle(options.position ?? "top-right"));
    this.root.hidden = options.open === false;

    const header = el("div");
    Object.assign(header.style, { display: "flex", alignItems: "center", gap: "8px" });
    this.mascot = new Buff();
    const title = el("strong", {}, "debuff");
    Object.assign(title.style, { color: LIME, fontSize: "12px", letterSpacing: "0.02em" });
    this.label = el("span");
    Object.assign(this.label.style, {
      marginLeft: "auto",
      padding: "1px 6px",
      borderRadius: "999px",
      background: `${LIME}22`,
      color: LIME,
      fontVariantNumeric: "tabular-nums",
    });
    header.append(this.mascot.root, title, this.label);

    this.graph = el("canvas") as HTMLCanvasElement;
    this.graph.width = HISTORY * 2;
    this.graph.height = 40;
    Object.assign(this.graph.style, { width: "100%", height: "40px", display: "block", margin: "6px 0", imageRendering: "pixelated" });

    this.paramsBox = el("div");
    this.root.append(header, this.graph, this.paramsBox);
    document.body.append(this.root);

    const key = options.toggleKey ?? "Backquote";
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== key) return;
      this.root.hidden = !this.root.hidden;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    this.cleanups.push(() => removeEventListener("keydown", onKey));
    this.cleanups.push(game.hooks.afterRender(() => this.frame()));
    this.cleanups.push(game.params.onChange((c) => this.sync(`${c.group}.${c.key}`, c.value)));
    this.cleanups.push(game.inspect.register("dev-overlay", () => ({ open: !this.root.hidden })));
    this.buildParams();
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.root.remove();
  }

  private frame(): void {
    const now = performance.now();
    this.frameTimes[this.head] = now - this.lastFrame;
    this.head = (this.head + 1) % HISTORY;
    this.lastFrame = now;
    if (this.root.hidden) return;
    // Groups can be defined after the overlay installs; rebuild controls when they change.
    const groups = Object.keys(this.game.params.describe()).join(",");
    if (groups !== this.knownGroups) this.buildParams();
    if (this.head % 10 === 0) {
      const s = this.game.stats.summary();
      const slow = s.fps > 0 && s.fps < 55;
      this.label.textContent = `${s.fps} fps · ${s.workMs.toFixed(1)} ms`;
      this.label.title = `work p95 ${s.workP95Ms.toFixed(1)} ms`;
      this.label.style.color = slow ? OVER_BUDGET : LIME;
      this.label.style.background = `${slow ? OVER_BUDGET : LIME}22`;
      // buff reacts to the last frame: worried on a spike, calm otherwise.
      this.mascot.mood((this.frameTimes[(this.head + HISTORY - 1) % HISTORY] ?? 0) > 17.5 || slow ? "worried" : "calm");
    }
    this.drawGraph();
  }

  private drawGraph(): void {
    const ctx = this.graph.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = this.graph;
    const scale = h / 33.3; // 0–33 ms range; the line marks 16.7 ms (60 fps)
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, h - 16.7 * scale, w, 1);
    for (let i = 0; i < HISTORY; i++) {
      const ms = this.frameTimes[(this.head + i) % HISTORY] ?? 0;
      const bar = Math.min(h, ms * scale);
      ctx.fillStyle = ms > 17.5 ? OVER_BUDGET : LIME;
      ctx.fillRect(i * 2, h - bar, 2, bar);
    }
  }

  private buildParams(): void {
    const described = this.game.params.describe();
    this.knownGroups = Object.keys(described).join(",");
    this.paramsBox.replaceChildren();
    this.inputs.clear();
    let groupIndex = 0;
    for (const [groupId, { schema, values }] of Object.entries(described)) {
      if (groupId.startsWith("dev-")) continue;
      const accent = ACCENTS[groupIndex++ % ACCENTS.length] ?? LIME;
      const box = el("details", { open: "" });
      Object.assign(box.style, { borderLeft: `2px solid ${accent}`, paddingLeft: "8px", margin: "6px 0" });
      const summary = el("summary", {}, groupId);
      Object.assign(summary.style, { cursor: "pointer", color: accent, margin: "4px 0", fontWeight: "600" });
      box.append(summary);
      for (const [key, spec] of Object.entries(schema)) {
        const id = `${groupId}.${key}`;
        const value = values[key] as ParamValue;
        const row = el("label");
        Object.assign(row.style, { display: "grid", gridTemplateColumns: "1fr 1.4fr 3.5em", gap: "6px", alignItems: "center" });
        const units = spec.type === "number" && spec.units ? ` (${spec.units})` : "";
        const name = el("span", { title: `${spec.description ?? id}${units}` }, key);
        const input = el("input") as HTMLInputElement;
        const readout = el("span");
        readout.style.textAlign = "right";
        if (spec.type === "boolean") {
          input.type = "checkbox";
          input.checked = value as boolean;
          input.addEventListener("change", () => this.set(groupId, key, input.checked));
        } else {
          Object.assign(input, rangeFor(spec, value as number));
          input.style.accentColor = accent;
          input.addEventListener("input", () => this.set(groupId, key, Number(input.value)));
          readout.textContent = format(value as number);
        }
        this.inputs.set(id, input);
        row.append(name, input, readout);
        box.append(row);
      }
      const actions = el("div");
      Object.assign(actions.style, { display: "flex", gap: "6px", margin: "4px 0 8px" });
      const reset = button("reset", () => this.game.params.group(groupId)?.reset());
      const copy = button("copy JSON", () =>
        navigator.clipboard?.writeText(JSON.stringify({ [groupId]: this.game.params.describe()[groupId]?.values }, null, 2)),
      );
      actions.append(reset, copy);
      box.append(actions);
      this.paramsBox.append(box);
    }
  }

  private set(group: string, key: string, value: ParamValue): void {
    try {
      this.game.params.group(group)?.set(key, value);
    } catch (err) {
      console.warn(`[debuff overlay] ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Reflect changes made elsewhere (console, agents, scenarios) in the controls. */
  private sync(id: string, value: ParamValue): void {
    const input = this.inputs.get(id);
    if (!input) return;
    if (input.type === "checkbox") input.checked = value as boolean;
    else {
      input.value = String(value);
      const readout = input.nextElementSibling;
      if (readout) readout.textContent = format(value as number);
    }
  }
}

function rangeFor(spec: NumberParamSpec, value: number): Partial<HTMLInputElement> {
  // Without bounds, offer a range around the current value.
  const min = spec.min ?? Math.min(0, value * 2);
  const max = spec.max ?? Math.max(1, Math.abs(value) * 2);
  const span = max - min;
  const step = span <= 1 ? 0.01 : span <= 20 ? 0.1 : 1;
  return { type: "range", min: String(min), max: String(max), step: String(step), value: String(value) };
}

function format(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", { type: "button" }, text) as HTMLButtonElement;
  Object.assign(b.style, {
    font: "inherit",
    background: "#1a2010",
    color: LIME,
    border: `1px solid ${LIME}55`,
    borderRadius: "4px",
    padding: "1px 6px",
    cursor: "pointer",
  });
  b.addEventListener("click", onClick);
  return b;
}

function panelStyle(position: NonNullable<DevOverlayOptions["position"]>): Partial<CSSStyleDeclaration> {
  const [v, h] = position.split("-") as ["top" | "bottom", "left" | "right"];
  return {
    position: "fixed",
    [v]: "8px",
    [h]: "8px",
    zIndex: "2147483647",
    width: "260px",
    maxHeight: "calc(100vh - 16px)",
    overflow: "auto",
    padding: "8px 10px",
    background: "rgba(10, 12, 8, 0.88)",
    color: "#e5e7eb",
    font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    border: `1px solid ${LIME}40`,
    borderRadius: "6px",
    backdropFilter: "blur(4px)",
  };
}

/** buff, the debuff mascot, drawn with DOM: a lime block with eyes that blinks and reacts to frame spikes. */
class Buff {
  readonly root: HTMLElement;
  private readonly eyes: HTMLElement[];
  private current: "calm" | "worried" = "calm";

  constructor() {
    this.root = el("span", { "aria-hidden": "true" });
    Object.assign(this.root.style, {
      position: "relative",
      display: "inline-block",
      width: "16px",
      height: "14px",
      borderRadius: "3px",
      background: LIME,
      boxShadow: "inset 0 3px 0 #d9f99d",
      animation: "debuff-buff-hop 1.2s ease-in-out infinite",
      transformOrigin: "50% 100%",
    });
    this.eyes = [3, 9].map((left) => {
      const eye = el("span");
      Object.assign(eye.style, {
        position: "absolute",
        left: `${left}px`,
        top: "5px",
        width: "3px",
        height: "4px",
        borderRadius: "1px",
        background: "#11140d",
        animation: "debuff-buff-blink 3.3s infinite",
      });
      this.root.append(eye);
      return eye;
    });
    if (!document.getElementById("debuff-buff-style")) {
      const style = el("style", { id: "debuff-buff-style" });
      style.textContent = `
@keyframes debuff-buff-hop { 0%,100% { transform: translateY(0) scale(1.08, .92) } 50% { transform: translateY(-2px) scale(.96, 1.04) } }
@keyframes debuff-buff-blink { 0%,46%,50%,100% { transform: scaleY(1) } 48% { transform: scaleY(.1) } }
@media (prefers-reduced-motion: reduce) { [data-debuff-overlay] * { animation: none !important } }`;
      document.head.append(style);
    }
  }

  mood(next: "calm" | "worried"): void {
    if (next === this.current) return;
    this.current = next;
    for (const eye of this.eyes) eye.style.background = next === "worried" ? OVER_BUDGET : "#11140d";
    this.root.style.animationDuration = next === "worried" ? "0.4s" : "1.2s";
  }
}
