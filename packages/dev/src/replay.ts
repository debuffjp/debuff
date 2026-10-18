import type { Game, ParamValue } from "@debuffjp/core";
import type { DrivableInput } from "./index.js";

/** A scenario step, as `debuff scenario` runs it (kept structural so `dev` doesn't depend on the CLI). */
export type ReplayStep =
  | { wait: number }
  | { press: string }
  | { release: string }
  | { pointerDown: [number, number] }
  | { pointerMove: [number, number] }
  | { pointerUp: true }
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
    const wrap = <T extends object, K extends keyof T>(target: T, key: K, record: (...args: never[]) => ReplayStep | undefined) => {
      const original = target[key] as unknown as (...args: unknown[]) => unknown;
      (target as Record<K, unknown>)[key] = ((...args: unknown[]) => {
        const step = (record as (...a: unknown[]) => ReplayStep | undefined)(...args);
        if (step) this.add(step);
        return original.apply(target, args);
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

/** What a rewind carries across the page reload (sessionStorage, this tab only). */
export interface RewindRequest {
  v: 1;
  /** The page the replay was recorded on; a rewind on another page is ignored. */
  page: string;
  /** The whole known session, so you can scrub forward again after rewinding. */
  timeline: Replay;
  /** Tick to stop at. */
  tick: number;
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
  for (const step of steps) {
    if (game.clock.tick >= toTick) break;
    if ("wait" in step) game.step(Math.min(step.wait, toTick - game.clock.tick), false);
    else if ("press" in step) input.keys.press(step.press);
    else if ("release" in step) input.keys.release(step.release);
    else if ("pointerDown" in step) input.pointer.press(...step.pointerDown);
    else if ("pointerMove" in step) input.pointer.move(...step.pointerMove);
    else if ("pointerUp" in step) input.pointer.release();
    else if ("set" in step)
      for (const [path, value] of Object.entries(step.set)) {
        const [group = "", key = ""] = path.split(".");
        game.params.group(group)?.set(key, value);
      }
    else if ("command" in step) command(step.command, ...(step.args ?? []));
  }
  if (game.clock.tick < toTick) game.step(toTick - game.clock.tick, false);
  game.redraw();
}
