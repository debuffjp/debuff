import type { Game, ParamValue } from "@debuffjp/core";
import type { DrivableInput, DrivablePadState } from "./index.js";

/** Gamepad state for one poll: pressed standard-mapping button indices and left stick axes (full floats). */
export interface PadStep {
  buttons: number[];
  axes: number[];
}

/** A scenario step, as `debuff scenario` runs it (kept structural so `dev` doesn't depend on the CLI). */
export type ReplayStep =
  | { wait: number }
  | { press: string }
  | { release: string }
  | { pointerDown: [number, number] }
  | { pointerMove: [number, number] }
  | { pointerUp: true }
  /** Wheel scroll in CSS pixels: `dy`, or `[dy, dx]`. */
  | { wheel: number | [number, number] }
  /** Touch contacts by id, in logical coordinates. A pen adds `"pen"`. */
  | { touchDown: [number, number, number] | [number, number, number, "pen"] }
  | { touchMove: [number, number, number] }
  | { touchUp: number }
  /** The gamepad state from this tick's poll on (`null` = disconnected). Only changes are recorded. */
  | { pad: PadStep | null }
  | { set: Record<string, ParamValue> }
  | { command: string; args?: unknown[] };

/** A recorded session as a scenario: run it with `debuff scenario <file>` to replay it exactly. */
export interface Replay {
  name: string;
  steps: ReplayStep[];
  /** Simulation ticks covered. */
  ticks: number;
  /** Things in this session a replay can't reproduce exactly, if any. */
  warnings: string[];
}

interface Recorded {
  tick: number;
  step: ReplayStep;
}

const MAX_EVENTS = 200_000;

/** Pointer buttons a scenario presses like keys, by their binding names. */
const POINTER_BUTTONS: Readonly<Record<string, "right" | "middle">> = { PointerRight: "right", PointerMiddle: "middle" };

/** Press a key, or the right or middle mouse button by its binding name (`"PointerRight"`, `"PointerMiddle"`). */
export function pressSource(input: DrivableInput, code: string): void {
  const button = POINTER_BUTTONS[code];
  if (!button) input.keys.press(code);
  else if (input.pointer.pressButton) input.pointer.pressButton(button);
  else throw new Error(`press("${code}") needs @debuffjp/input 0.16 or later (pointer.pressButton)`);
}

/** Release what `pressSource` pressed. */
export function releaseSource(input: DrivableInput, code: string): void {
  const button = POINTER_BUTTONS[code];
  if (!button) input.keys.release(code);
  else input.pointer.releaseButton?.(button);
}

const BUTTON_CODES = { right: "PointerRight", middle: "PointerMiddle" } as const;

type PointerOps = Required<Pick<DrivableInput["pointer"], "scroll" | "touchStart" | "touchMove" | "touchEnd">>;

/** A wheel or touch method of the input's pointer, explained when the input is too old to have it. */
export function pointerOp<K extends keyof PointerOps>(input: DrivableInput, name: K): PointerOps[K] {
  const fn = input.pointer[name];
  if (!fn) throw new Error(`pointer.${name} needs @debuffjp/input 0.16 or later`);
  return fn.bind(input.pointer) as PointerOps[K];
}

/**
 * Records input and param changes per simulation tick from page load, so a live session can be turned
 * into a scenario that replays it exactly (the fixed-step clock and seeded RNG make runs deterministic).
 * Wraps the input's own methods, so real events, dev hooks and agents are all captured. Dev only.
 */
export class InputRecording {
  private readonly events: Recorded[] = [];
  private readonly warnings = new Set<string>();
  private readonly restore: (() => void)[] = [];
  /** Last recorded pointer position per tick, to keep moves compact. */
  private lastMoveTick = -1;

  constructor(
    private readonly game: Game,
    input: DrivableInput,
  ) {
    let nested = false;
    const wrap = <T extends object, K extends keyof T>(target: T, key: K, record: (...args: never[]) => ReplayStep | null | undefined) => {
      const original = target[key] as unknown as (...args: unknown[]) => unknown;
      (target as Record<K, unknown>)[key] = ((...args: unknown[]) => {
        // `record` returns the step, `null` when it's already covered (a collapsed move), or undefined to
        // leave the call unrecorded. A recorded call replays everything it does itself (a touch presses
        // the pointer), so calls made inside it aren't recorded again.
        const step = nested ? undefined : (record as (...a: unknown[]) => ReplayStep | null | undefined)(...args);
        if (step === undefined) return original.apply(target, args);
        if (step) this.add(step);
        nested = true;
        try {
          return original.apply(target, args);
        } finally {
          nested = false;
        }
      }) as T[K];
      this.restore.push(() => {
        (target as Record<K, unknown>)[key] = original as T[K];
      });
    };
    const held = new Set<string>();
    wrap(input.keys, "press", (code: string) => {
      if (held.has(code)) return undefined;
      held.add(code);
      return { press: code };
    });
    wrap(input.keys, "release", (code: string) => (held.delete(code) ? { release: code } : undefined));
    let pointerDown = false;
    wrap(input.pointer, "press", (x: number, y: number) => {
      pointerDown = true;
      return { pointerDown: [round(x), round(y)] };
    });
    wrap(input.pointer, "move", (x: number, y: number) => {
      // Moves only matter while held (or for hover games); keep the last one per tick.
      if (this.game.clock.tick === this.lastMoveTick) {
        const last = this.events.at(-1);
        if (last && "pointerMove" in last.step) {
          last.step = { pointerMove: [round(x), round(y)] };
          return undefined;
        }
      }
      this.lastMoveTick = this.game.clock.tick;
      return { pointerMove: [round(x), round(y)] };
    });
    wrap(input.pointer, "release", () => {
      if (!pointerDown) return undefined;
      pointerDown = false;
      return { pointerUp: true };
    });
    if (input.pointer.pressButton && input.pointer.releaseButton) {
      const buttons = new Set<string>();
      wrap(input.pointer, "pressButton", (b: "right" | "middle") => {
        if (buttons.has(b)) return undefined;
        buttons.add(b);
        return { press: BUTTON_CODES[b] };
      });
      wrap(input.pointer, "releaseButton", (b: "right" | "middle") => (buttons.delete(b) ? { release: BUTTON_CODES[b] } : undefined));
    }
    const { pointer } = input;
    if (pointer.scroll) wrap(pointer, "scroll", (dy: number, dx = 0) => ({ wheel: dx ? [round(dy), round(dx)] : round(dy) }));
    if (pointer.touchStart && pointer.touchMove && pointer.touchEnd) {
      // Mouse contacts stay pointerDown / pointerMove / pointerUp, recorded by the calls they make.
      const touching = new Set<number>();
      wrap(pointer, "touchStart", (id: number, x: number, y: number, kind = "touch") => {
        if (kind === "mouse" || touching.has(id)) return undefined;
        touching.add(id);
        return { touchDown: kind === "pen" ? [id, round(x), round(y), "pen"] : [id, round(x), round(y)] };
      });
      wrap(pointer, "touchMove", (id: number, x: number, y: number) => {
        if (!touching.has(id)) return undefined;
        const step: ReplayStep = { touchMove: [id, round(x), round(y)] };
        // Keep the last move per contact per tick.
        const last = this.events.at(-1);
        if (last?.tick === this.game.clock.tick && "touchMove" in last.step && last.step.touchMove[0] === id) {
          last.step = step;
          return null;
        }
        return step;
      });
      wrap(pointer, "touchEnd", (id: number) => (touching.delete(id) ? { touchUp: id } : undefined));
    }
    const pads = input.pads;
    if (pads) {
      const sample = pads.sample;
      let last = "null";
      pads.sample = () => {
        const state = sample.call(pads);
        const step = state ? toPadStep(state) : null;
        const key = JSON.stringify(step);
        if (key !== last) {
          last = key;
          this.add({ pad: step });
        }
        return state;
      };
      this.restore.push(() => {
        pads.sample = sample;
      });
    }
    this.restore.push(game.params.onChange((c) => this.add({ set: { [`${c.group}.${c.key}`]: c.value } })));
  }

  /** Events recorded so far. */
  get count(): number {
    return this.events.length;
  }

  /** Note something that makes an exact replay impossible (shown with the replay). */
  warn(message: string): void {
    this.warnings.add(message);
  }

  /** The session from page load up to `toTick` (default: now) as scenario steps. */
  toReplay(toTick = this.game.clock.tick, name = `replay to tick ${toTick}`): Replay {
    const steps: ReplayStep[] = [];
    let at = 0;
    for (const e of this.events) {
      if (e.tick > toTick) break;
      if (e.tick > at) {
        steps.push({ wait: e.tick - at });
        at = e.tick;
      }
      steps.push(e.step);
    }
    if (toTick > at) steps.push({ wait: toTick - at });
    return { name, steps, ticks: toTick, warnings: [...this.warnings] };
  }

  dispose(): void {
    for (const r of this.restore.reverse()) r();
  }

  /** Record a game command (see `DevHooksOptions.commands`) so replays run it at the same tick. */
  command(name: string, args: unknown[]): void {
    this.add(args.length ? { command: name, args } : { command: name });
  }

  private add(step: ReplayStep): void {
    if (this.events.length >= MAX_EVENTS) {
      this.warn("Recording hit its size limit; later input isn't included.");
      return;
    }
    // Input arriving between frames is seen by the next simulation step, which is exactly what a scenario
    // does when it issues the input after `tick` steps.
    this.events.push({ tick: this.game.clock.tick, step });
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

const toPadStep = (s: DrivablePadState): PadStep => ({
  buttons: s.buttons.flatMap((b, i) => (b.pressed ? [i] : [])),
  // Full floats: the deadzone and analog speed depend on exact values.
  axes: [s.axes[0] ?? 0, s.axes[1] ?? 0],
});

export const toPadState = (s: PadStep | null): DrivablePadState | null =>
  s && {
    buttons: Array.from({ length: Math.max(17, ...s.buttons.map((i) => i + 1)) }, (_, i) => ({ pressed: s.buttons.includes(i) })),
    axes: s.axes,
  };

/** What a rewind carries across the page reload (sessionStorage, this tab only). */
export interface RewindRequest {
  v: 1;
  /** The page the replay was recorded on; a rewind on another page is ignored. */
  page: string;
  /** The whole known session, so you can scrub forward again after rewinding. */
  timeline: Replay;
  /** Tick to stop at. */
  tick: number;
  /** Why: a rewind stays paused there; a code reload carries on playing if the game was running. */
  reason?: "rewind" | "reload";
  /** Keep running after the replay (reloads of a running game). */
  resume?: boolean;
}

const REWIND_KEY = "debuff:rewind";

export function storeRewind(request: RewindRequest): void {
  sessionStorage.setItem(REWIND_KEY, JSON.stringify(request));
}

/** Read and clear a pending rewind for this page, if any. */
export function takeRewind(): RewindRequest | undefined {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(REWIND_KEY);
    sessionStorage.removeItem(REWIND_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    const request = JSON.parse(raw) as RewindRequest;
    return request.v === 1 && request.page === pagePath() ? request : undefined;
  } catch {
    return undefined;
  }
}

export const pagePath = (): string => location.pathname;

export interface ReplayTarget {
  game: Game;
  input: DrivableInput;
  command: (name: string, ...args: unknown[]) => unknown;
}

/**
 * Play `steps` into the game up to `toTick`, without drawing, exactly as `debuff scenario` would.
 * Input goes through the (recorded) input, so the recording picks the session up again.
 */
export function fastForward({ game, input, command }: ReplayTarget, steps: ReplayStep[], toTick: number): void {
  const held = new Set<string>();
  let pointerHeld = false;
  const touches = new Set<number>();
  // Recordings start with no pad (only changes are recorded): don't let a real one leak in.
  if (input.pads) input.pads.fed = null;
  for (const step of steps) {
    if (game.clock.tick >= toTick) break;
    if ("wait" in step) game.step(Math.min(step.wait, toTick - game.clock.tick), false);
    else if ("press" in step) {
      held.add(step.press);
      pressSource(input, step.press);
    } else if ("release" in step) {
      held.delete(step.release);
      releaseSource(input, step.release);
    } else if ("pointerDown" in step) {
      pointerHeld = true;
      input.pointer.press(...step.pointerDown);
    } else if ("pointerMove" in step) input.pointer.move(...step.pointerMove);
    else if ("pointerUp" in step) {
      pointerHeld = false;
      input.pointer.release();
    } else if ("wheel" in step) {
      const [dy, dx] = typeof step.wheel === "number" ? [step.wheel, 0] : step.wheel;
      pointerOp(input, "scroll")(dy, dx);
    } else if ("touchDown" in step) {
      const [id, x, y, kind] = step.touchDown;
      touches.add(id);
      pointerOp(input, "touchStart")(id, x, y, kind ?? "touch");
    } else if ("touchMove" in step) pointerOp(input, "touchMove")(...step.touchMove);
    else if ("touchUp" in step) {
      touches.delete(step.touchUp);
      pointerOp(input, "touchEnd")(step.touchUp);
    } else if ("pad" in step) {
      if (input.pads) input.pads.fed = toPadState(step.pad);
    } else if ("set" in step)
      for (const [path, value] of Object.entries(step.set)) {
        const [group = "", key = ""] = path.split(".");
        game.params.group(group)?.set(key, value);
      }
    else if ("command" in step) command(step.command, ...(step.args ?? []));
  }
  if (game.clock.tick < toTick) game.step(toTick - game.clock.tick, false);
  // Nobody is physically holding these any more: let go, or they'd stay stuck down.
  for (const code of held) releaseSource(input, code);
  for (const id of touches) input.pointer.touchEnd?.(id);
  if (pointerHeld) input.pointer.release();
  // Hand the pads back to the real Gamepad API.
  if (input.pads) input.pads.fed = undefined;
  // The replay took real time: restart the loop's clock so the next frame doesn't try to catch up on it.
  if (game.isRunning) {
    game.stop();
    game.start();
  }
  game.redraw();
}
