import type { Game, ParamDescription, ParamValue, Plugin } from "@debuffjp/core";
import type { ExplainedError } from "./explain.js";
import type { Replay } from "./replay.js";
import { DevSession, type FrameSample, type Note } from "./session.js";

/** The parts of `@debuffjp/input`'s `Input` the hooks drive. Structural, so `dev` does not depend on `input`. */
export interface DrivableInput {
  keys: { press(code: string): void; release(code: string): void };
  pointer: { press(x: number, y: number): void; move(x: number, y: number): void; release(): void };
}

export interface DevState {
  scene: string | undefined;
  tick: number;
  time: number;
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
  params(): Record<string, ParamDescription>;
  setParam(group: string, key: string, value: ParamValue): void;
  /** The latest `n` frame breakdowns (update/render ms, steps, quads, draw calls, long tasks), oldest first. */
  frames(n?: number): FrameSample[];
  /**
   * Everything played since page load (keys, pointer, param changes) up to `toTick` (default: now), as a
   * scenario that replays it exactly. Pass a note's `tick` to get the session leading up to that note.
   */
  replay(toTick?: number): Replay;
  /** Moments the human flagged in the overlay, with the game state at that tick. */
  notes(): Note[];
  /**
   * Runtime errors since load, explained: `kind` says whose problem it is ("your-code", "debuff-usage",
   * "debuff-bug", "outside"), `where` points at the game's source, `hint` suggests a next step. Repeats are counted.
   */
  errors(): ExplainedError[];
  /** PNG data URL of the current frame. */
  capture(): string;
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
    frozen: game.frozen,
    pausedBy: session.pausedBy ?? null,
    timeScale: game.timeScale,
    renderer: game.draw.kind,
    stats: game.stats.summary(),
    state: game.scene?.inspect?.(),
    pluginNames: game.plugins,
    plugins: game.inspect.snapshot(),
    notes: session.notes.length,
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
    params: () => game.params.describe(),
    setParam: (group, key, value) => session.setParam(group, key, value, who()),
    frames: (n = 60) => session.recorder.recent(n),
    replay: (toTick) => {
      if (!session.recording) throw new Error("Replays need input: use devTools({ input })");
      return session.recording.toReplay(toTick);
    },
    notes: () => session.notes.map((n) => ({ ...n })),
    errors: () => errors.map((e) => ({ ...e })),
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
export { InputRecording, type Replay, type ReplayStep } from "./replay.js";
export {
  type Activity,
  DevSession,
  diagnose,
  FrameRecorder,
  type FrameSample,
  type FrameSummary,
  HITCH,
  type Note,
  summarize,
} from "./session.js";
