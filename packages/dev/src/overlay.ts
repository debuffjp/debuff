import type { Game, NumberParamSpec, ParamSpec, ParamValue, Plugin } from "@debuffjp/core";
import { type ExplainedError, loc } from "./explain.js";
import { DevSession, diagnose, type FrameSample, HITCH, summarize } from "./session.js";

export interface DevOverlayOptions {
  /** Key (KeyboardEvent.code) that toggles the overlay. Default "Backquote". */
  toggleKey?: string;
  /** Start visible. Default true. */
  open?: boolean;
  /** Corner to dock to. Default "top-right". */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const LIME = "#cffb2d";
const SKY = "#38bdf8";
const VIOLET = "#a78bfa";
const AMBER = "#fbbf24";
const PINK = "#f472b6";
/** Accent colours cycled across param groups, for splashes of colour. */
const ACCENTS = [LIME, SKY, PINK, AMBER, VIOLET];
const OVER_BUDGET = "#f87171";
const TEXT = "#cfd6c4";
const MUTED = "#8a9479";
const BUDGET_MS = 1000 / 60;
const BARS = 120;
const BAR_W = 2;
const TABS = ["perf", "tune", "state", "log"] as const;
type Tab = (typeof TABS)[number];

/**
 * Dev-only overlay. A toolbar (pause, step, speed, snapshot, restart) over four tabs:
 * **perf** (frame graph, headroom, hitches and their causes, a frame inspector), **tune** (live
 * controls for every `game.params` group), **state** (the scene's `inspect()` data, live) and
 * **log** (errors, activity with undo, notes for agents). Plain DOM, no dependencies.
 * Use inside `if (import.meta.env.DEV)`.
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
  private readonly body: HTMLElement;
  private readonly graph: HTMLCanvasElement;
  private readonly label: HTMLElement;
  private readonly agentBadge: HTMLElement;
  private readonly errorBadge: HTMLButtonElement;
  private readonly mascot: Buff;
  private readonly collapseButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly summaryLine: HTMLElement;
  private readonly inspector: HTMLElement;
  private readonly paramsBox: HTMLElement;
  private readonly statePre: HTMLElement;
  private readonly errorsBox: HTMLElement;
  private readonly activityBox: HTMLElement;
  private readonly tabButtons = new Map<Tab, HTMLButtonElement>();
  private readonly panes = new Map<Tab, HTMLElement>();
  private readonly inputs = new Map<string, HTMLInputElement>();
  private readonly defaults = new Map<string, ParamValue>();
  private readonly cleanups: (() => void)[] = [];
  /** Value each slider had when the current drag began. */
  private readonly dragStart = new Map<string, ParamValue>();
  private knownGroups = "";
  /** Frames-ago index of the bar under the pointer or selected, or undefined. */
  private selected: number | undefined;
  private collapsed = false;
  private tab: Tab = "perf";
  private frameCounter = 0;

  constructor(
    private readonly game: Game,
    options: DevOverlayOptions,
  ) {
    this.session = DevSession.acquire(game);
    this.root = el("div", { "data-debuff-overlay": "" });
    Object.assign(this.root.style, panelStyle(options.position ?? "top-right"));
    this.root.hidden = options.open === false;

    // ---- header: always visible, even collapsed ----
    const header = el("div");
    Object.assign(header.style, { display: "flex", alignItems: "center", gap: "6px", userSelect: "none" });
    this.mascot = new Buff();
    const title = el("strong", {}, "debuff");
    Object.assign(title.style, { color: LIME, fontSize: "12px", letterSpacing: "0.02em" });
    this.agentBadge = chip("agent", VIOLET);
    this.agentBadge.title = "An agent is connected to this game";
    this.agentBadge.hidden = true;
    this.errorBadge = button("", () => {
      this.setCollapsed(false);
      this.showTab("log");
    });
    Object.assign(this.errorBadge.style, { color: OVER_BUDGET, borderColor: `${OVER_BUDGET}66`, padding: "0 5px" });
    this.errorBadge.hidden = true;
    this.label = chip("", LIME);
    Object.assign(this.label.style, { marginLeft: "auto", fontVariantNumeric: "tabular-nums" });
    this.collapseButton = button("", () => this.setCollapsed(!this.collapsed));
    Object.assign(this.collapseButton.style, { padding: "0 6px", minWidth: "22px" });
    header.append(this.mascot.root, title, this.agentBadge, this.errorBadge, this.label, this.collapseButton);
    // Double-click the header bar to collapse or expand, like a window title bar.
    header.addEventListener("dblclick", (e) => {
      if (!(e.target instanceof HTMLButtonElement)) this.setCollapsed(!this.collapsed);
    });

    // ---- toolbar ----
    const toolbar = row();
    toolbar.style.margin = "6px 0";
    this.pauseButton = button("pause", () => (this.session.paused ? this.session.resume() : this.session.pause()));
    const step = button("step", () => this.session.step(1));
    step.title = "Advance one fixed step (pauses first)";
    const speed = el("select", { title: "Simulation speed" }) as HTMLSelectElement;
    for (const [v, t] of [
      ["1", "1×"],
      ["0.5", "½×"],
      ["0.25", "¼×"],
    ] as const) {
      speed.append(el("option", { value: v }, t));
    }
    Object.assign(speed.style, inputStyle());
    speed.addEventListener("change", () => this.session.setSpeed(Number(speed.value)));
    const snap = button("snap", () => this.snapshot());
    snap.title = "Download the current frame as a PNG";
    const restart = button("restart", () => this.restartScene());
    restart.title = "Re-enter the current scene";
    restart.style.marginLeft = "auto";
    toolbar.append(this.pauseButton, step, speed, snap, restart);

    // ---- tabs ----
    const tabBar = row();
    Object.assign(tabBar.style, { gap: "2px", borderBottom: `1px solid ${LIME}33`, marginBottom: "6px" });
    for (const t of TABS) {
      const b = el("button", { type: "button", role: "tab" }, t) as HTMLButtonElement;
      Object.assign(b.style, {
        font: "inherit",
        background: "none",
        border: "none",
        borderBottom: "2px solid transparent",
        color: MUTED,
        padding: "2px 8px",
        cursor: "pointer",
      });
      b.addEventListener("click", () => this.showTab(t));
      this.tabButtons.set(t, b);
      tabBar.append(b);
    }

    // perf
    this.graph = el("canvas", {
      title: "Frame time: bar height is the frame, lime is update, sky is render. Click to inspect.",
    }) as HTMLCanvasElement;
    this.graph.width = BARS * BAR_W;
    this.graph.height = 48;
    Object.assign(this.graph.style, { width: "100%", height: "48px", display: "block", imageRendering: "pixelated", cursor: "crosshair" });
    this.graph.addEventListener("pointermove", (e) => this.pick(e));
    this.graph.addEventListener("pointerleave", () => {
      if (!this.session.paused) this.selected = undefined;
      this.drawGraph();
    });
    this.graph.addEventListener("click", (e) => {
      this.pick(e);
      if (!this.session.paused) this.session.pause("you", "to inspect a frame");
    });
    this.summaryLine = el("div");
    Object.assign(this.summaryLine.style, { margin: "4px 0", lineHeight: "1.45" });
    this.inspector = el("div");
    Object.assign(this.inspector.style, { minHeight: "44px", margin: "4px 0", color: TEXT, fontSize: "10.5px", lineHeight: "1.45" });
    const spikeLabel = el("label", { title: `Pause automatically on the first dropped frame (over ${HITCH}× budget)` });
    Object.assign(spikeLabel.style, { display: "flex", alignItems: "center", gap: "4px", color: TEXT });
    const spike = el("input", { type: "checkbox" }) as HTMLInputElement;
    spike.style.accentColor = OVER_BUDGET;
    spike.addEventListener("change", () => {
      this.session.pauseOnSpikeMs = spike.checked ? BUDGET_MS * HITCH : 0;
    });
    spikeLabel.append(spike, document.createTextNode("pause on dropped frame"));
    this.addPane("perf", this.graph, this.summaryLine, this.inspector, spikeLabel);

    // tune
    this.paramsBox = el("div");
    this.addPane("tune", this.paramsBox);

    // state
    this.statePre = el("pre");
    Object.assign(this.statePre.style, {
      margin: "0",
      maxHeight: "260px",
      overflow: "auto",
      color: TEXT,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    });
    const stateActions = row();
    stateActions.style.marginTop = "6px";
    stateActions.append(
      button("copy", () => navigator.clipboard?.writeText(this.stateText())),
      hint("updates live; pause to read a moment"),
    );
    this.addPane("state", this.statePre, stateActions);

    // log
    this.errorsBox = el("div");
    this.activityBox = el("div");
    Object.assign(this.activityBox.style, { maxHeight: "160px", overflow: "auto", display: "grid", gap: "2px" });
    const noteRow = row();
    noteRow.style.marginTop = "6px";
    const noteInput = el("input", { type: "text", placeholder: "flag this moment for the agent…" }) as HTMLInputElement;
    Object.assign(noteInput.style, { ...inputStyle(), flex: "1", minWidth: "0" });
    const addNote = () => {
      if (!noteInput.value.trim()) return;
      this.session.note(noteInput.value.trim());
      noteInput.value = "";
    };
    // Typing here must not drive the game.
    for (const type of ["keydown", "keyup"] as const) noteInput.addEventListener(type, (e) => e.stopPropagation());
    noteInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addNote();
    });
    noteRow.append(noteInput, button("flag", addNote));
    // Replays: everything played since load, as a scenario that reproduces it exactly.
    const replayRow = row();
    replayRow.style.marginTop = "6px";
    const save = button("save replay", () => this.saveReplay(false));
    save.title = "Download this session as a scenario (drop it in scenarios/ or run it with debuff scenario)";
    const copyReplay = button("copy replay", () => this.saveReplay(true));
    copyReplay.title = "Copy this session as scenario JSON, e.g. to paste to an agent";
    replayRow.append(save, copyReplay, hint("replays the session exactly"));
    this.addPane("log", this.errorsBox, this.activityBox, noteRow, replayRow);

    this.body = el("div");
    this.body.append(toolbar, tabBar, ...this.panes.values());
    this.root.append(header, this.body);
    this.showTab(readTab());
    this.setCollapsed(readCollapsed());
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
    this.cleanups.push(
      game.inspect.register("dev-overlay", () => ({
        open: !this.root.hidden,
        collapsed: this.collapsed,
        tab: this.tab,
        paused: this.session.paused,
      })),
    );
    this.cleanups.push(this.session.subscribe(() => this.refreshSession()));
    this.buildParams();
    this.refreshSession();
  }

  /** Collapse to just the header bar (mascot, fps, badges); remembered across reloads. */
  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.body.hidden = collapsed;
    this.collapseButton.textContent = collapsed ? "▸" : "▾";
    this.collapseButton.title = collapsed ? "Expand the dev panel" : "Collapse the dev panel";
    this.collapseButton.setAttribute("aria-expanded", String(!collapsed));
    store(COLLAPSED_KEY, collapsed ? "1" : "0");
  }

  showTab(tab: Tab): void {
    this.tab = tab;
    for (const [t, pane] of this.panes) pane.hidden = t !== tab;
    for (const [t, b] of this.tabButtons) {
      const on = t === tab;
      b.setAttribute("aria-selected", String(on));
      b.style.color = on ? LIME : MUTED;
      b.style.borderBottomColor = on ? LIME : "transparent";
    }
    store(TAB_KEY, tab);
    if (tab === "state") this.refreshState();
    if (tab === "perf") this.drawGraph();
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.root.remove();
    this.session.release();
  }

  private addPane(tab: Tab, ...children: HTMLElement[]): void {
    const pane = el("div", { role: "tabpanel", "data-tab": tab });
    pane.append(...children);
    this.panes.set(tab, pane);
  }

  private frame(): void {
    if (this.root.hidden) return;
    // Groups can be defined after the overlay installs; rebuild controls when they change.
    const groups = Object.keys(this.game.params.describe()).join(",");
    if (groups !== this.knownGroups) this.buildParams();
    const slowTick = ++this.frameCounter % 10 === 0 || this.session.paused;
    if (slowTick) {
      const s = this.game.stats.summary();
      const slow = s.fps > 0 && s.fps < 55 && !this.session.paused;
      this.label.textContent = this.session.paused ? `paused · tick ${this.game.clock.tick}` : `${s.fps} fps`;
      this.label.title = `work ${s.workMs.toFixed(1)} ms (p95 ${s.workP95Ms.toFixed(1)} ms)`;
      const color = this.session.paused ? AMBER : slow ? OVER_BUDGET : LIME;
      this.label.style.color = color;
      this.label.style.background = `${color}22`;
      const last = this.session.recorder.get(0);
      this.mascot.mood((last && last.intervalMs > BUDGET_MS * HITCH) || slow ? "worried" : "calm");
      this.agentBadge.hidden = !this.session.agentConnected;
    }
    if (this.collapsed) return;
    if (this.tab === "perf") {
      this.drawGraph();
      if (slowTick) this.refreshSummary();
      if (this.selected === undefined) this.showFrame(undefined);
    } else if (this.tab === "state" && slowTick && !this.session.paused) {
      this.refreshState();
    }
  }

  /** Bar height is the frame interval (what the player feels), coloured by health; work is stacked inside. */
  private drawGraph(): void {
    if (this.collapsed || this.tab !== "perf") return;
    const ctx = this.graph.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = this.graph;
    const scale = h / (BUDGET_MS * 2);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, Math.round(h - BUDGET_MS * scale), w, 1);
    const rec = this.session.recorder;
    for (let i = 0; i < BARS; i++) {
      const s = rec.get(BARS - 1 - i);
      if (!s) continue;
      const x = i * BAR_W;
      const total = Math.min(h, s.intervalMs * scale);
      const hitch = s.intervalMs > BUDGET_MS * HITCH;
      const late = s.intervalMs > BUDGET_MS * 1.05;
      ctx.fillStyle = hitch ? `${OVER_BUDGET}cc` : late ? `${AMBER}55` : `${LIME}40`;
      ctx.fillRect(x, h - total, BAR_W, total);
      // Work is usually a sliver; give it at least a pixel so it's visible.
      const upd = s.updateMs > 0 ? Math.max(1, Math.min(h, s.updateMs * scale)) : 0;
      const ren = s.renderMs > 0 ? Math.max(1, Math.min(h - upd, s.renderMs * scale)) : 0;
      ctx.fillStyle = LIME;
      ctx.fillRect(x, h - upd, BAR_W, upd);
      ctx.fillStyle = SKY;
      ctx.fillRect(x, h - upd - ren, BAR_W, ren);
      if (this.selected === BARS - 1 - i) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(x, 0, BAR_W, h);
      }
    }
  }

  private refreshSummary(): void {
    const sum = summarize(this.session.recorder.recent(BARS), BUDGET_MS);
    if (!sum.frames) {
      this.summaryLine.replaceChildren(line(["waiting for frames…", MUTED]));
      return;
    }
    const headroom = Math.round(sum.headroom * 100);
    const cause =
      sum.hitches === 0
        ? (["no dropped frames", LIME] as [string, string])
        : sum.gameHitches === 0
          ? ([`${sum.hitches} dropped, all from outside the game (GC, browser, other tabs)`, AMBER] as [string, string])
          : ([`${sum.hitches} dropped, ${sum.gameHitches} from the game's own work`, OVER_BUDGET] as [string, string]);
    this.summaryLine.replaceChildren(
      line("work ", [`${sum.avgWorkMs.toFixed(1)} ms`, LIME], ` avg · ${sum.p95WorkMs.toFixed(1)} p95 · `, [
        `${headroom}% headroom`,
        headroom > 50 ? LIME : headroom > 20 ? AMBER : OVER_BUDGET,
      ]),
      line(`last ${sum.seconds.toFixed(0)} s: `, cause),
    );
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
      this.inspector.replaceChildren(
        line([
          this.session.paused
            ? "paused: hover or click bars to inspect frames, or step"
            : "hover the graph to inspect a frame · click to pause there",
          MUTED,
        ]),
      );
      return;
    }
    const hitch = s.intervalMs > BUDGET_MS * HITCH;
    this.inspector.replaceChildren(
      line(`tick ${s.tick} · ${s.scene ?? "no scene"} · `, [`${s.intervalMs.toFixed(1)} ms`, hitch ? OVER_BUDGET : LIME]),
      line(
        "",
        [`update ${s.updateMs.toFixed(2)}`, LIME],
        " · ",
        [`render ${s.renderMs.toFixed(2)} ms`, SKY],
        ` · ${s.steps} step${s.steps === 1 ? "" : "s"}`,
      ),
      line(`${s.quads} quads · ${s.drawCalls} draw calls${s.longTaskMs ? ` · long task ${s.longTaskMs.toFixed(0)} ms` : ""}`),
      line([diagnose(s, BUDGET_MS), hitch ? AMBER : MUTED]),
    );
  }

  private stateText(): string {
    const scene = this.game.scene;
    const plugins = this.game.inspect.snapshot();
    delete plugins["dev-overlay"];
    return JSON.stringify(
      {
        scene: scene?.id ?? null,
        tick: this.game.clock.tick,
        state: scene?.inspect?.() ?? null,
        ...(Object.keys(plugins).length ? { plugins } : {}),
      },
      null,
      2,
    );
  }

  private refreshState(): void {
    let text: string;
    try {
      text = this.stateText();
    } catch (err) {
      text = `inspect() threw: ${err instanceof Error ? err.message : err}`;
    }
    if (!this.game.scene?.inspect) text += "\n\n// add inspect() to your scene to see its state here";
    if (this.statePre.textContent !== text) this.statePre.textContent = text;
  }

  private refreshSession(): void {
    const { session } = this;
    this.pauseButton.textContent = session.paused ? "play" : "pause";
    this.pauseButton.title = session.paused ? `Paused by ${session.pausedBy}` : "Pause the game loop";
    if (!session.paused) this.selected = undefined;

    const errors = session.errors;
    this.errorBadge.hidden = errors.length === 0;
    this.errorBadge.textContent = `${errors.length} error${errors.length === 1 ? "" : "s"}`;
    this.errorBadge.title = "Show errors in the log tab";
    this.errorsBox.replaceChildren(
      ...errors
        .slice(-5)
        .reverse()
        .map((e) => errorCard(e, () => this.session.clearErrors())),
    );

    // Activity log, newest first.
    const entries = session.activity.slice(-30).reverse();
    this.activityBox.replaceChildren(
      ...(entries.length ? [] : [hint("nothing yet: your changes, an agent's and notes show here")]),
      ...entries.map((a) => {
        const r = row();
        r.style.alignItems = "baseline";
        const who = el("span", {}, a.who);
        who.style.color = a.who === "agent" ? VIOLET : a.who === "spike" ? OVER_BUDGET : LIME;
        const what = el("span", {}, `${a.action}${a.detail ? ` ${a.detail}` : ""}`);
        Object.assign(what.style, { color: TEXT, flex: "1", minWidth: "0", overflowWrap: "anywhere" });
        r.append(who, what);
        if (a.undo) {
          const undo = button("undo", () => {
            a.undo?.();
            delete a.undo;
            session.log("you", "undid", a.detail);
          });
          undo.style.padding = "0 4px";
          r.append(undo);
        }
        return r;
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
      Object.assign(box.style, { borderLeft: `2px solid ${accent}`, paddingLeft: "8px", margin: "0 0 8px" });
      const summary = el("summary", {}, groupId);
      Object.assign(summary.style, { cursor: "pointer", color: accent, margin: "2px 0 4px", fontWeight: "600" });
      box.append(summary);
      for (const [key, spec] of Object.entries(schema)) box.append(this.paramRow(groupId, key, spec, values[key] as ParamValue, accent));
      const actions = row();
      actions.style.margin = "4px 0 2px";
      const copy = button("copy changes", () => navigator.clipboard?.writeText(this.changesText(groupId)));
      copy.title = "Copy the values you changed from their defaults, ready to paste into your params";
      actions.append(
        button("reset all", () => this.game.params.group(groupId)?.reset()),
        copy,
      );
      box.append(actions);
      this.paramsBox.append(box);
    }
    if (!this.paramsBox.childElementCount) {
      this.paramsBox.append(hint("define params with game.params.define(...) to tune them here, live"));
    }
  }

  private paramRow(groupId: string, key: string, spec: ParamSpec, value: ParamValue, accent: string): HTMLElement {
    const id = `${groupId}.${key}`;
    this.defaults.set(id, spec.default);
    const r = el("label");
    Object.assign(r.style, { display: "grid", gridTemplateColumns: "1fr 1.4fr 3.5em", gap: "6px", alignItems: "center" });
    const units = spec.type === "number" && spec.units ? ` (${spec.units})` : "";
    const name = el("span", { title: `${spec.description ?? id}${units}\ndefault ${String(spec.default)} · double-click to reset` }, key);
    name.style.cursor = "default";
    name.addEventListener("dblclick", (e) => {
      e.preventDefault();
      this.session.setParam(groupId, key, spec.default, "you");
    });
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
      // Arrow keys on a focused slider must tune it, not drive the game.
      for (const type of ["keydown", "keyup"] as const) input.addEventListener(type, (e) => e.stopPropagation());
    }
    this.inputs.set(id, input);
    r.append(name, input, readout);
    this.markChanged(id, value);
    return r;
  }

  /** Changed-from-default values get an amber name and readout, so you can see what you've tuned. */
  private markChanged(id: string, value: ParamValue): void {
    const input = this.inputs.get(id);
    if (!input) return;
    const name = input.previousElementSibling as HTMLElement | null;
    const readout = input.nextElementSibling as HTMLElement | null;
    const changed = value !== this.defaults.get(id);
    if (name) name.style.color = changed ? AMBER : "";
    if (readout) {
      readout.textContent = typeof value === "number" ? format(value) : "";
      readout.style.color = changed ? AMBER : "";
    }
  }

  private changesText(groupId: string): string {
    const group = this.game.params.describe()[groupId];
    if (!group) return "";
    const changed = Object.entries(group.values).filter(([k, v]) => v !== group.schema[k]?.default);
    if (!changed.length) return `// ${groupId}: all defaults`;
    return changed
      .map(([k, v]) => `${k}: { default: ${JSON.stringify(v)} }, // was ${JSON.stringify(group.schema[k]?.default)}`)
      .join("\n");
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
    else input.value = String(value);
    this.markChanged(id, value);
  }

  private saveReplay(copy: boolean): void {
    const recording = this.session.recording;
    if (!recording) {
      this.session.log("you", "can't save a replay", "pass { input } to devTools() to record");
      return;
    }
    const replay = recording.toReplay();
    const json = `${JSON.stringify({ name: replay.name, steps: replay.steps }, null, 2)}\n`;
    if (copy) void navigator.clipboard?.writeText(json);
    else {
      const a = el("a", {
        href: URL.createObjectURL(new Blob([json], { type: "application/json" })),
        download: `replay-tick-${replay.ticks}.json`,
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.getAttribute("href") ?? ""), 1000);
    }
    const note = replay.warnings.length ? ` (approximate: ${replay.warnings.join(" ")})` : "";
    this.session.log("you", copy ? "copied a replay" : "saved a replay", `${replay.ticks} ticks${note}`);
  }

  private snapshot(): void {
    // Re-render without advancing time: WebGL clears its buffer after presenting, so read in the same task.
    this.game.redraw();
    const a = el("a", {
      href: this.game.canvas.toDataURL("image/png"),
      download: `debuff-${this.game.scene?.id ?? "game"}-${this.game.clock.tick}.png`,
    });
    a.click();
    this.session.log("you", "saved a snapshot", `tick ${this.game.clock.tick}`);
  }

  private restartScene(): void {
    const id = this.game.scene?.id;
    if (!id) return;
    this.game.go(id);
    this.session.log("you", "restarted", id);
  }
}

const KIND: Record<ExplainedError["kind"], [string, string]> = {
  "your-code": ["your code", AMBER],
  "debuff-usage": ["debuff rejected a call", SKY],
  "debuff-bug": ["debuff bug", OVER_BUDGET],
  outside: ["outside the game", MUTED],
};

/** One error, explained: whose problem it is, where to look (click to open in your editor), what to try. */
function errorCard(e: ExplainedError, clear: () => void): HTMLElement {
  const [label, color] = KIND[e.kind];
  const card = el("div", { "data-error-kind": e.kind });
  Object.assign(card.style, {
    margin: "0 0 6px",
    padding: "5px 7px",
    borderLeft: `2px solid ${color}`,
    background: `${color}12`,
    borderRadius: "4px",
  });
  const head = row();
  head.append(chip(label, color));
  if (e.count > 1) head.append(hint(`×${e.count}`));
  if (e.phase) head.append(hint(`in ${e.phase}${e.tick === undefined ? "" : ` · tick ${e.tick}`}`));
  const msg = el("div", {}, `${e.name}: ${e.message}`);
  Object.assign(msg.style, { color: "#fecaca", margin: "3px 0", overflowWrap: "anywhere" });
  card.append(head, msg);
  if (e.where) {
    const where = loc(e.where);
    // Vite's dev server opens files in your editor at this endpoint.
    const link = el(
      "a",
      { href: `/__open-in-editor?file=${encodeURIComponent(where)}`, title: "Open in your editor" },
      `→ ${where}${e.where.fn ? ` (${e.where.fn})` : ""}`,
    );
    Object.assign(link.style, { color: SKY, textDecoration: "none", display: "block" });
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      void fetch(link.getAttribute("href") ?? "");
    });
    card.append(link);
  }
  const tip = el("div", {}, e.hint);
  Object.assign(tip.style, { color: TEXT, margin: "3px 0" });
  card.append(tip);
  const actions = row();
  if (e.reportUrl) {
    const report = el("a", { href: e.reportUrl, target: "_blank", rel: "noopener" }, "report to debuff");
    Object.assign(report.style, { color: OVER_BUDGET });
    actions.append(report);
  }
  const copy = button("copy for agent", () => navigator.clipboard?.writeText(JSON.stringify(e, null, 2)));
  copy.title = "Copy the explained error as JSON to paste into a chat with an agent";
  actions.append(copy, button("clear", clear));
  card.append(actions);
  return card;
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

const COLLAPSED_KEY = "debuff:dev-overlay:collapsed";
const TAB_KEY = "debuff:dev-overlay:tab";

function readCollapsed(): boolean {
  return load(COLLAPSED_KEY) === "1";
}

function readTab(): Tab {
  const t = load(TAB_KEY);
  return (TABS as readonly string[]).includes(t ?? "") ? (t as Tab) : "perf";
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the state just isn't remembered.
  }
}

function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(): HTMLElement {
  const r = el("div");
  Object.assign(r.style, { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" });
  return r;
}

function hint(text: string): HTMLElement {
  const h = el("span", {}, text);
  h.style.color = MUTED;
  return h;
}

function chip(text: string, color: string): HTMLElement {
  const c = el("span", {}, text);
  Object.assign(c.style, { padding: "1px 6px", borderRadius: "999px", background: `${color}22`, color, whiteSpace: "nowrap" });
  return c;
}

/** One line from plain strings and [text, colour] pairs. */
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
    width: "290px",
    maxHeight: "calc(100vh - 16px)",
    overflow: "auto",
    padding: "8px 10px",
    background: "rgba(10, 12, 8, 0.92)",
    color: "#e5e7eb",
    font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    border: `1px solid ${LIME}40`,
    borderRadius: "6px",
    backdropFilter: "blur(4px)",
  };
}

/** buff, the debuff mascot, drawn with DOM: a lime block with eyes that blinks and reacts to dropped frames. */
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
      boxShadow: "inset 0 3px 0 #e7fd96",
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
