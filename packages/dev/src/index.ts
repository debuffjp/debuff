import type { Game, ParamDescription, ParamValue, Plugin } from "@debuffjp/core";
import type { Report } from "myaku";
import type { ExplainedError } from "./explain.js";
import { type PadStep, type Replay, takeRewind, toPadState } from "./replay.js";
import { DevSession, type FrameSample, type GameEventRecord, type Note, type TypeDiagnostic } from "./session.js";

/** The parts of `@debuffjp/input`'s `Input` the hooks drive. Structural, so `dev` does not depend on `input`. */
export interface DrivableInput {
  keys: { press(code: string): void; release(code: string): void };
  pointer: { press(x: number, y: number): void; move(x: number, y: number): void; release(): void };
  /** Gamepads (`@debuffjp/input`'s `Gamepads`): recorded per poll, and fed back on replay. */
  pads?: DrivablePads;
}

/** The raw pad state a poll reads (matches `@debuffjp/input`'s `PadState`); `null` = no pad. */
export interface DrivablePadState {
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}

export interface DrivablePads {
  /** Overrides the Gamepad API when set. */
  fed: DrivablePadState | null | undefined;
  sample(): DrivablePadState | null;
}

export interface DevState {
  scene: string | undefined;
  tick: number;
  time: number;
  /** Seconds per fixed simulation step (the game's `clock.step`, 1/60 by default). */
  step: number;
  frozen: boolean;
  /** Who paused the game ("you", "agent", "spike"…), or null while running. */
  pausedBy: string | null;
  timeScale: number;
  /** Active rendering backend. */
  renderer: "webgl2" | "2d";
  stats: ReturnType<Game["stats"]["summary"]>;
  /** Whatever the active scene's `inspect()` returns. */
  state: unknown;
  /** Installed plugin names, in install order. */
  pluginNames: readonly string[];
  /** Snapshots from `game.inspect` providers, keyed by name. */
  plugins: Record<string, unknown>;
  /** Number of notes the human has flagged (read them with `notes()`). */
  notes: number;
  /** How many times the game emitted each event (`game.emit("coin")` → `events.coin`) since load. */
  events: Record<string, number>;
}

/**
 * The dev inspection and control surface, available as `window.__DEBUFF_DEV__` in dev builds.
 * Every method takes and returns JSON-serialisable values so browsers, CLIs and agents can call it.
 */
export interface DevHooks {
  readonly version: 2;
  /** True when the page was opened with `?debuff-scenario`: the loop is stopped and time only advances via `step`. */
  readonly controlled: boolean;
  /** Advance `steps` fixed simulation steps (pausing first) and return the new state. */
  step(steps?: number): DevState;
  state(): DevState;
  pause(): DevState;
  resume(): DevState;
  /** Simulation speed multiplier (1 = normal). */
  speed(scale: number): void;
  press(code: string): void;
  release(code: string): void;
  /** Press and release the primary pointer at logical coordinates across one step. */
  tap(x: number, y: number): void;
  pointerDown(x: number, y: number): void;
  pointerMove(x: number, y: number): void;
  pointerUp(): void;
  /** Feed gamepad state (pressed standard-mapping button indices, left stick axes); `null` = no pad, `undefined` = real pads again. */
  pad(state: PadStep | null | undefined): void;
  params(): Record<string, ParamDescription>;
  setParam(group: string, key: string, value: ParamValue): void;
  /** The latest `n` frame breakdowns (update/render ms, steps, quads, draw calls, long tasks), oldest first. */
  frames(n?: number): FrameSample[];
  /**
   * myaku's report: frame-time percentiles, hitches per minute, and the worst hitches explained (cause,
   * confidence, the script to look at, a hint), with debuff's update and render as spans.
   */
  profile(): Report;
  /**
   * Everything played since page load (keys, pointer, param changes) up to `toTick` (default: now), as a
   * scenario that replays it exactly. Pass a note's `tick` to get the session leading up to that note.
   */
  replay(toTick?: number): Replay;
  /**
   * Reload and replay this session's inputs to `tick`, then pause there: the exact state at that moment.
   * Within the known session you can go forward again, until new play branches off.
   */
  rewind(tick: number): void;
  /** The latest game events (`game.emit`), oldest first, optionally only those after `sinceTick`. */
  events(sinceTick?: number): GameEventRecord[];
  /**
   * Save the session for a state-preserving reload (the `debuff dev` client calls this just before a
   * code change reloads the page). After the reload the new code replays it to the same tick.
   */
  keepForReload(): void;
  /** Moments the human flagged in the overlay, with the game state at that tick. */
  notes(): Note[];
  /**
   * Runtime errors since load, explained: `kind` says whose problem it is ("your-code", "debuff-usage",
   * "debuff-bug", "outside"), `where` points at the game's source, `hint` suggests a next step. Repeats are counted.
   */
  errors(): ExplainedError[];
  /**
   * Type errors from the dev server's last type-check (`typecheck: true` in debuff.config), replaced on
   * every check after a save. Empty when type-checking is off or the code type-checks.
   */
  typeErrors(): TypeDiagnostic[];
  /** PNG data URL of the current frame. */
  capture(): string;
  /**
   * The current frame's relative luminance (0 black to 1 white, WCAG), averaged over a `cols` × `rows`
   * grid, row by row. `region` (`[x, y, w, h]` in logical units) samples part of the screen. For flash
   * and contrast checks in scenarios.
   */
  luminance(cols: number, rows: number, region?: [number, number, number, number]): number[];
  /** Names of the commands the game registered with `devTools({ commands })`. */
  commands(): string[];
  /** Run a game command, e.g. to start a scenario at a checkpoint. Recorded in replays. */
  command(name: string, ...args: unknown[]): unknown;
}

declare global {
  interface Window {
    __DEBUFF_DEV__?: DevHooks;
  }
}

export interface DevHooksOptions {
  input?: DrivableInput;
  /**
   * Accept commands from agents through the dev server (`debuff dev` + `@debuffjp/mcp`), so an agent
   * works on this live game and its actions show in the overlay. Default true.
   */
  agentLink?: boolean;
  /**
   * Game-defined commands that scenarios (`{ "command": "warp", "args": ["hollow"] }`) and agents can run,
   * e.g. jumping to a checkpoint or granting an item. Keeps test shortcuts out of the game's own code paths.
   */
  commands?: Record<string, (...args: never[]) => unknown>;
  /**
   * Keep your place when a code change reloads the page under `debuff dev`: the session's inputs are
   * replayed with the new code to the tick you were on. Default true.
   */
  keepState?: boolean;
}

/** Dev-server endpoints for the agent link (see `@debuffjp/cli`). */
export const AGENT_EVENTS = "/__debuff/agent/events";
export const AGENT_RESULT = "/__debuff/agent/result";

/**
 * The dev tools as a runtime plugin. Installs `window.__DEBUFF_DEV__` and removes it on `game.dispose()`.
 * Use inside `if (import.meta.env.DEV)` so bundlers drop it; `debuff build` fails if it leaks.
 */
export function devTools(options: DevHooksOptions = {}): Plugin {
  return {
    name: "dev-tools",
    install(game) {
      const session = DevSession.acquire(game);
      if (options.input) session.attachInput(options.input);
      const errors = session.errors;
      const hooks = createHooks(game, session, options, errors, () => (hooks.controlled ? "scenario" : "agent"));
      window.__DEBUFF_DEV__ = hooks;
      // A rewind reloaded the page: replay to the chosen tick before the first frame runs.
      const rewind = options.input && !hooks.controlled ? takeRewind() : undefined;
      if (rewind && options.input) session.restore(rewind, { game, input: options.input, command: hooks.command });
      const unlink = options.agentLink === false || hooks.controlled ? undefined : linkAgent(game, session, options, errors);
      return () => {
        unlink?.();
        delete window.__DEBUFF_DEV__;
        session.release();
      };
    },
  };
}

/** Shorthand for `game.use(devTools(options))`; returns the installed hooks. */
export function exposeDevHooks(game: Game, options: DevHooksOptions = {}): DevHooks {
  game.use(devTools(options));
  if (!window.__DEBUFF_DEV__) throw new Error("dev-tools plugin did not install");
  return window.__DEBUFF_DEV__;
}

function createHooks(game: Game, session: DevSession, options: DevHooksOptions, errors: ExplainedError[], who: () => string): DevHooks {
  const controlled = new URLSearchParams(location.search).has("debuff-scenario");
  if (controlled) {
    game.pauseWhenHidden = false;
    game.stop();
  }

  const input = (): DrivableInput => {
    if (!options.input) throw new Error("exposeDevHooks: pass { input } to drive input");
    return options.input;
  };

  const state = (): DevState => ({
    scene: game.scene?.id,
    tick: game.clock.tick,
    time: game.clock.time,
    step: game.clock.step,
    frozen: game.frozen,
    pausedBy: session.pausedBy ?? null,
    timeScale: game.timeScale,
    renderer: game.draw.kind,
    stats: game.stats.summary(),
    state: game.scene?.inspect?.(),
    pluginNames: game.plugins,
    plugins: game.inspect.snapshot(),
    notes: session.notes.length,
    events: { ...session.eventCounts },
  });

  return {
    version: 2,
    controlled,
    step(steps = 1) {
      // Scenarios own the clock already; elsewhere, stepping pauses the live loop first.
      if (controlled) game.step(steps);
      else session.step(steps, who());
      return state();
    },
    state,
    pause() {
      session.pause(who());
      return state();
    },
    resume() {
      session.resume(who());
      return state();
    },
    speed: (scale) => session.setSpeed(scale, who()),
    press: (code) => input().keys.press(code),
    release: (code) => input().keys.release(code),
    tap(x, y) {
      input().pointer.press(x, y);
      game.step(1);
      input().pointer.release();
    },
    pointerDown: (x, y) => input().pointer.press(x, y),
    pointerMove: (x, y) => input().pointer.move(x, y),
    pointerUp: () => input().pointer.release(),
    pad(state) {
      const pads = input().pads;
      if (!pads) throw new Error("exposeDevHooks: this input has no gamepads");
      pads.fed = state === undefined ? undefined : toPadState(state);
    },
    params: () => game.params.describe(),
    setParam: (group, key, value) => session.setParam(group, key, value, who()),
    frames: (n = 60) => session.recorder.recent(n),
    profile: () => session.profiler.report(),
    keepForReload: () => {
      if (!controlled && options.keepState !== false) session.keepForReload();
    },
    events: (sinceTick = -1) => session.events.filter((e) => e.tick > sinceTick).map((e) => ({ ...e })),
    rewind: (tick) => {
      if (controlled) throw new Error("Rewind works on a live game; in a scenario or headless copy, replay its steps instead");
      session.rewind(tick);
    },
    replay: (toTick) => {
      if (!session.recording) throw new Error("Replays need input: use devTools({ input })");
      return session.recording.toReplay(toTick);
    },
    notes: () => session.notes.map((n) => ({ ...n })),
    errors: () => errors.map((e) => ({ ...e })),
    typeErrors: () => session.typeErrors.map((e) => ({ ...e })),
    commands: () => Object.keys(options.commands ?? {}),
    command: (name, ...args) => {
      const fn = options.commands?.[name];
      if (!fn) throw new Error(`Unknown command "${name}". Registered: ${Object.keys(options.commands ?? {}).join(", ") || "none"}`);
      session.recording?.command(name, args);
      session.log(who(), "command", name);
      return (fn as (...a: unknown[]) => unknown)(...args);
    },
    capture: () => {
      // Re-render without advancing time: WebGL clears its buffer after presenting, so read in the same task.
      game.redraw();
      return game.canvas.toDataURL("image/png");
    },
    luminance: (cols, rows, region) => sampleLuminance(game, cols, rows, region),
  };
}

/**
 * Agent link (page side): listen for commands from the dev server over Server-Sent Events, run them
 * on the dev hooks as "agent", and post results back. Silent when the page isn't served by `debuff dev`.
 */
function linkAgent(game: Game, session: DevSession, options: DevHooksOptions, errors: ExplainedError[]): (() => void) | undefined {
  if (typeof EventSource === "undefined" || !/^https?:$/.test(location.protocol)) return undefined;
  const hooks = createHooks(game, session, options, errors, () => "agent");
  const events = new EventSource(AGENT_EVENTS);
  events.addEventListener("error", () => {
    // 404 (not served by debuff dev) closes the stream for good; nothing else to do.
    if (events.readyState === EventSource.CLOSED) events.close();
  });
  events.addEventListener("presence", (e) =>
    session.setAgentsAttached((JSON.parse((e as MessageEvent<string>).data) as { agents: number }).agents),
  );
  events.addEventListener("command", (e) => {
    const { id, method, args } = JSON.parse((e as MessageEvent<string>).data) as { id: string; method: keyof DevHooks; args: unknown[] };
    session.agentSeen();
    let body: { id: string; ok: true; result: unknown } | { id: string; ok: false; error: string };
    try {
      const fn = hooks[method];
      if (typeof fn !== "function") throw new Error(`Unknown dev hook "${String(method)}"`);
      body = { id, ok: true, result: (fn as (...a: unknown[]) => unknown)(...args) };
      if (method === "capture") session.log("agent", "captured a frame");
      else if (method === "press" || method === "release" || method === "tap") session.log("agent", method, String(args[0] ?? ""));
    } catch (err) {
      body = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    void fetch(AGENT_RESULT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  });
  return () => events.close();
}

export { type ErrorKind, type ExplainedError, explainError, type SourceLocation } from "./explain.js";
export { type DevOverlayOptions, devOverlay } from "./overlay.js";
export { InputRecording, type PadStep, type Replay, type ReplayStep } from "./replay.js";
export {
  type Activity,
  DevSession,
  diagnose,
  FrameRecorder,
  type FrameSample,
  type FrameSummary,
  type GameEventRecord,
  HITCH,
  type Note,
  summarize,
  type TypeDiagnostic,
} from "./session.js";

let sampler: CanvasRenderingContext2D | null | undefined;

/** Downscale the current frame onto a small canvas and convert each cell to WCAG relative luminance. */
function sampleLuminance(game: Game, cols: number, rows: number, region?: [number, number, number, number]): number[] {
  if (!(cols >= 1 && rows >= 1 && cols * rows <= 1_000_000)) throw new RangeError("luminance: cols and rows must be at least 1");
  game.redraw();
  sampler ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!sampler) throw new Error("luminance: a 2D canvas is unavailable");
  const canvas = sampler.canvas;
  canvas.width = cols;
  canvas.height = rows;
  sampler.imageSmoothingEnabled = true;
  sampler.imageSmoothingQuality = "high";
  // Logical units to backing-store pixels.
  const sx = game.canvas.width / game.width;
  const sy = game.canvas.height / game.height;
  const [x, y, w, h] = region ?? [0, 0, game.width, game.height];
  sampler.clearRect(0, 0, cols, rows);
  sampler.drawImage(game.canvas, x * sx, y * sy, w * sx, h * sy, 0, 0, cols, rows);
  const data = sampler.getImageData(0, 0, cols, rows).data;
  const linear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 4)
    out.push(0.2126 * linear(data[i] ?? 0) + 0.7152 * linear(data[i + 1] ?? 0) + 0.0722 * linear(data[i + 2] ?? 0));
  return out;
}
