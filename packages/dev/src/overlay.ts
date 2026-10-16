import type { Game, NumberParamSpec, ParamValue, Plugin } from "@debuff/core";
import { DevSession, diagnose, type FrameSample } from "./session.js";

export interface DevOverlayOptions {
  /** Key (KeyboardEvent.code) that toggles the overlay. Default "Backquote". */
  toggleKey?: string;
  /** Start visible. Default true. */
  open?: boolean;
  /** Corner to dock to. Default "top-right". */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const LIME = "#a3e635";
const SKY = "#38bdf8";
const VIOLET = "#a78bfa";
const AMBER = "#fbbf24";
/** Accent colours cycled across param groups, for splashes of colour. */
const ACCENTS = ["#a3e635", "#38bdf8", "#f472b6", "#fbbf24", "#a78bfa"];
const OVER_BUDGET = "#f87171";
const BUDGET_MS = 1000 / 60;
const BARS = 120;
const BAR_W = 2;

/**
 * Dev-only overlay: frame graph with a pausable frame inspector, live controls for every
 * `game.params` group, an activity log (yours and any agent's) and notes for agents.
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
  private readonly session: DevSession;
  private readonly root: HTMLElement;
  private readonly graph: HTMLCanvasElement;
  private readonly label: HTMLElement;
  private readonly agentBadge: HTMLElement;
  private readonly mascot: Buff;
  private readonly controls: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly inspector: HTMLElement;
  private readonly paramsBox: HTMLElement;
  private readonly activityBox: HTMLElement;
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly cleanups: (() => void)[] = [];
  private knownGroups = "";
  /** Frames-ago index of the bar under the pointer or selected, or undefined. */
  private selected: number | undefined;
  private frameCounter = 0;

  constructor(
    private readonly game: Game,
    options: DevOverlayOptions,
  ) {
    this.session = DevSession.acquire(game);
    this.root = el("div", { "data-debuff-overlay": "" });
    Object.assign(this.root.style, panelStyle(options.position ?? "top-right"));
    this.root.hidden = options.open === false;

    const header = el("div");
    Object.assign(header.style, { display: "flex", alignItems: "center", gap: "8px" });
    this.mascot = new Buff();
    const title = el("strong", {}, "debuff");
    Object.assign(title.style, { color: LIME, fontSize: "12px", letterSpacing: "0.02em" });
    this.agentBadge = chip("agent", VIOLET);
    this.agentBadge.title = "An agent is connected to this game";
    this.agentBadge.hidden = true;
    this.label = chip("", LIME);
    this.label.style.marginLeft = "auto";
    this.label.style.fontVariantNumeric = "tabular-nums";
    header.append(this.mascot.root, title, this.agentBadge, this.label);

    this.graph = el("canvas") as HTMLCanvasElement;
    this.graph.width = BARS * BAR_W;
    this.graph.height = 44;
    Object.assign(this.graph.style, {
      width: "100%",
      height: "44px",
      display: "block",
      margin: "6px 0 2px",
      imageRendering: "pixelated",
      cursor: "crosshair",
    });
    this.graph.addEventListener("pointermove", (e) => this.pick(e));
    this.graph.addEventListener("pointerleave", () => {
      if (!this.session.paused) this.selected = undefined;
      this.drawGraph();
    });
    this.graph.addEventListener("click", (e) => {
      this.pick(e);
      if (!this.session.paused) this.session.pause("you", "to inspect a frame");
    });

    // Controls: pause/step/speed/pause-on-spike.
    this.controls = el("div");
    Object.assign(this.controls.style, { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", margin: "4px 0" });
    this.pauseButton = button("pause", () => (this.session.paused ? this.session.resume() : this.session.pause()));
    const step = button("step", () => this.session.step(1));
    step.title = "Advance one fixed step";
    const speed = el("select") as HTMLSelectElement;
    for (const [v, t] of [
      ["1", "1×"],
      ["0.5", "½×"],
      ["0.25", "¼×"],
    ] as const) {
      const o = el("option", { value: v }, t) as HTMLOptionElement;
      speed.append(o);
    }
    Object.assign(speed.style, inputStyle());
    speed.addEventListener("change", () => this.session.setSpeed(Number(speed.value)));
    const spikeLabel = el("label", { title: "Pause automatically when a frame takes longer than ~2 frames" });
    Object.assign(spikeLabel.style, { display: "flex", alignItems: "center", gap: "4px", color: "#cfd6c4" });
    const spike = el("input", { type: "checkbox" }) as HTMLInputElement;
    spike.style.accentColor = OVER_BUDGET;
    spike.addEventListener("change", () => {
      this.session.pauseOnSpikeMs = spike.checked ? BUDGET_MS * 2 : 0;
    });
    spikeLabel.append(spike, document.createTextNode("pause on spike"));
    this.controls.append(this.pauseButton, step, speed, spikeLabel);

    this.inspector = el("div");
    Object.assign(this.inspector.style, {
      minHeight: "30px",
      margin: "2px 0 6px",
      color: "#cfd6c4",
      fontSize: "10.5px",
      lineHeight: "1.45",
    });

    this.paramsBox = el("div");

    // Activity (yours and the agent's) and notes.
    const activity = el("details");
    const summary = el("summary", {}, "activity & notes");
    Object.assign(summary.style, { cursor: "pointer", color: VIOLET, margin: "4px 0", fontWeight: "600" });
    this.activityBox = el("div");
    Object.assign(this.activityBox.style, { maxHeight: "120px", overflow: "auto", display: "grid", gap: "2px" });
    const noteRow = el("div");
    Object.assign(noteRow.style, { display: "flex", gap: "6px", marginTop: "6px" });
    const noteInput = el("input", { type: "text", placeholder: "flag this moment for the agent…" }) as HTMLInputElement;
    Object.assign(noteInput.style, { ...inputStyle(), flex: "1", minWidth: "0" });
    const addNote = () => {
      if (!noteInput.value.trim()) return;
      this.session.note(noteInput.value.trim());
      noteInput.value = "";
    };
    noteInput.addEventListener("keydown", (e) => {
      e.stopPropagation(); // typing here must not drive the game
      if (e.key === "Enter") addNote();
    });
    noteRow.append(noteInput, button("flag", addNote));
    activity.append(summary, this.activityBox, noteRow);

    this.root.append(header, this.graph, this.controls, this.inspector, this.paramsBox, activity);
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
    this.cleanups.push(game.inspect.register("dev-overlay", () => ({ open: !this.root.hidden, paused: this.session.paused })));
    this.cleanups.push(this.session.subscribe(() => this.refreshSession()));
    this.buildParams();
    this.refreshSession();
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.root.remove();
    this.session.release();
  }

  private frame(): void {
    if (this.root.hidden) return;
    // Groups can be defined after the overlay installs; rebuild controls when they change.
    const groups = Object.keys(this.game.params.describe()).join(",");
    if (groups !== this.knownGroups) this.buildParams();
    if (++this.frameCounter % 10 === 0 || this.session.paused) {
      const s = this.game.stats.summary();
      const slow = s.fps > 0 && s.fps < 55 && !this.session.paused;
      this.label.textContent = this.session.paused ? `paused · tick ${this.game.clock.tick}` : `${s.fps} fps · ${s.workMs.toFixed(1)} ms`;
      this.label.title = `work p95 ${s.workP95Ms.toFixed(1)} ms`;
      const color = this.session.paused ? AMBER : slow ? OVER_BUDGET : LIME;
      this.label.style.color = color;
      this.label.style.background = `${color}22`;
      const last = this.session.recorder.get(0);
      this.mascot.mood((last && last.intervalMs > BUDGET_MS * 1.05) || slow ? "worried" : "calm");
      this.agentBadge.hidden = !this.session.agentConnected;
    }
    this.drawGraph();
    if (this.selected === undefined) this.showFrame(undefined);
  }

  /** Stacked bars: update (lime) + render (sky); the rest of the interval is shown dim. Red cap = over budget. */
  private drawGraph(): void {
    const ctx = this.graph.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = this.graph;
    const scale = h / (BUDGET_MS * 2);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, Math.round(h - BUDGET_MS * scale), w, 1);
    const rec = this.session.recorder;
    for (let i = 0; i < BARS; i++) {
      const s = rec.get(BARS - 1 - i);
      if (!s) continue;
      const x = i * BAR_W;
      const total = Math.min(h, s.intervalMs * scale);
      const upd = Math.min(h, s.updateMs * scale);
      const ren = Math.min(h - upd, s.renderMs * scale);
      ctx.fillStyle = "rgba(163,230,53,0.18)";
      ctx.fillRect(x, h - total, BAR_W, total);
      ctx.fillStyle = LIME;
      ctx.fillRect(x, h - upd, BAR_W, upd);
      ctx.fillStyle = SKY;
      ctx.fillRect(x, h - upd - ren, BAR_W, ren);
      if (s.intervalMs > BUDGET_MS * 1.05) {
        ctx.fillStyle = OVER_BUDGET;
        ctx.fillRect(x, h - total, BAR_W, 2);
      }
      if (this.selected === BARS - 1 - i) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(x, 0, BAR_W, h);
      }
    }
  }

  private pick(e: PointerEvent | MouseEvent): void {
    const rect = this.graph.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * BARS);
    this.selected = Math.max(0, Math.min(BARS - 1, BARS - 1 - i));
    this.drawGraph();
    this.showFrame(this.session.recorder.get(this.selected));
  }

  private showFrame(s: FrameSample | undefined): void {
    if (!s) {
      this.inspector.textContent = this.session.paused
        ? "paused: hover or click bars to inspect frames, or step forward"
        : "hover the graph to inspect a frame · click to pause there";
      this.inspector.style.color = "#8a9479";
      return;
    }
    const over = s.intervalMs > BUDGET_MS * 1.05;
    this.inspector.style.color = "#cfd6c4";
    this.inspector.replaceChildren(
      line(`tick ${s.tick} · ${s.scene ?? "no scene"} · `, [`${s.intervalMs.toFixed(1)} ms`, over ? OVER_BUDGET : LIME]),
      line(
        "",
        [`update ${s.updateMs.toFixed(2)}`, LIME],
        " · ",
        [`render ${s.renderMs.toFixed(2)} ms`, SKY],
        ` · ${s.steps} step${s.steps === 1 ? "" : "s"}`,
      ),
      line(`${s.quads} quads · ${s.drawCalls} draw calls${s.longTaskMs ? ` · long task ${s.longTaskMs.toFixed(0)} ms` : ""}`),
      line("", [diagnose(s, BUDGET_MS), over ? AMBER : "#8a9479"]),
    );
  }

  private refreshSession(): void {
    const { session } = this;
    this.pauseButton.textContent = session.paused ? "play" : "pause";
    this.pauseButton.title = session.paused ? `Paused by ${session.pausedBy}` : "Pause the game loop";
    if (!session.paused) this.selected = undefined;
    // Activity log, newest first.
    this.activityBox.replaceChildren(
      ...session.activity
        .slice(-30)
        .reverse()
        .map((a) => {
          const row = el("div");
          Object.assign(row.style, { display: "flex", gap: "6px", alignItems: "baseline" });
          const who = el("span", {}, a.who);
          who.style.color = a.who === "agent" ? VIOLET : a.who === "spike" ? OVER_BUDGET : LIME;
          const what = el("span", {}, `${a.action}${a.detail ? ` ${a.detail}` : ""}`);
          Object.assign(what.style, { color: "#cfd6c4", flex: "1", minWidth: "0", overflowWrap: "anywhere" });
          row.append(who, what);
          if (a.undo) {
            const undo = button("undo", () => {
              a.undo?.();
              delete a.undo;
              session.log("you", "undid", a.detail);
            });
            undo.style.padding = "0 4px";
            row.append(undo);
          }
          return row;
        }),
    );
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
        const input = el("input", { "data-param": id }) as HTMLInputElement;
        const readout = el("span");
        readout.style.textAlign = "right";
        if (spec.type === "boolean") {
          input.type = "checkbox";
          input.checked = value as boolean;
          input.addEventListener("change", () => this.set(groupId, key, input.checked));
        } else {
          Object.assign(input, rangeFor(spec, value as number));
          input.style.accentColor = accent;
          // Remember the value a drag starts from, so the whole drag becomes one undoable change.
          const remember = () => {
            if (!this.dragStart.has(id)) this.dragStart.set(id, this.game.params.group(groupId)?.get(key) ?? value);
          };
          input.addEventListener("pointerdown", remember);
          input.addEventListener("focus", remember);
          input.addEventListener("input", () => {
            remember();
            this.set(groupId, key, Number(input.value), true);
          });
          input.addEventListener("change", () => this.set(groupId, key, Number(input.value)));
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

  /** Slider drags update live without logging; the final value is logged once (with undo). */
  private set(group: string, key: string, value: ParamValue, live = false): void {
    try {
      if (live) this.game.params.group(group)?.set(key, value);
      else this.commitSet(group, key, value);
    } catch (err) {
      console.warn(`[debuff overlay] ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Value each slider had when the current drag began. */
  private readonly dragStart = new Map<string, ParamValue>();

  private commitSet(group: string, key: string, value: ParamValue): void {
    const id = `${group}.${key}`;
    const start = this.dragStart.get(id);
    this.dragStart.delete(id);
    // Put the pre-drag value back first so the session records one change with a correct undo.
    if (start !== undefined) this.game.params.group(group)?.set(key, start);
    this.session.setParam(group, key, value, "you");
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

function chip(text: string, color: string): HTMLElement {
  const c = el("span", {}, text);
  Object.assign(c.style, { padding: "1px 6px", borderRadius: "999px", background: `${color}22`, color, whiteSpace: "nowrap" });
  return c;
}

/** One inspector line from plain strings and [text, colour] pairs. */
function line(...parts: (string | [string, string])[]): HTMLElement {
  const div = el("div");
  for (const p of parts) {
    if (typeof p === "string") div.append(document.createTextNode(p));
    else {
      const span = el("span", {}, p[0]);
      span.style.color = p[1];
      div.append(span);
    }
  }
  return div;
}

function inputStyle(): Partial<CSSStyleDeclaration> {
  return {
    font: "inherit",
    background: "#1a2010",
    color: "#e7ebe0",
    border: `1px solid ${LIME}40`,
    borderRadius: "4px",
    padding: "1px 4px",
  };
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
    width: "280px",
    maxHeight: "calc(100vh - 16px)",
    overflow: "auto",
    padding: "8px 10px",
    background: "rgba(10, 12, 8, 0.9)",
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
      flex: "none",
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
