import { Gamepads } from "./gamepad.js";
import { Keyboard } from "./keyboard.js";
import { type ButtonState, Pointer, type ToLogical } from "./pointer.js";

/**
 * A binding is a source name:
 * - a `KeyboardEvent.code`: `"Space"`, `"KeyZ"`, `"ArrowLeft"`
 * - `"Pointer"`: primary mouse button / touch / pen
 * - `"PointerRight"`, `"PointerMiddle"`: the right and middle mouse buttons
 * - a gamepad button or stick direction: `"PadA"`, `"PadLeft"`, `"PadStickLeft"`
 * - an on-screen control from `TouchControls`: `"TouchStickLeft"`, `"TouchA"` (added in 0.25)
 */
export type Binding = string;

export type Bindings<A extends string> = Record<A, readonly Binding[]>;

const UP: ButtonState = Object.freeze({ down: false, pressed: false, released: false });

/** The parts of `Game` that `Input` uses. */
export interface InputHost {
  canvas: HTMLElement;
  toLogical: ToLogical;
  hooks: { afterUpdate(fn: (dt: number) => void): () => void };
}

export interface InputOptions<A extends string> {
  /** Named actions and the sources that trigger them. */
  bindings: Bindings<A>;
  /** Element receiving keyboard events. Default `window`. */
  keyboardTarget?: Window | HTMLElement;
  /** Block the browser default for bound keys (page scrolling in embeds). Default true. */
  captureKeys?: boolean;
  /** Block page scrolling while the wheel is over the canvas, for games that zoom with it. Default false. */
  captureWheel?: boolean;
}

/**
 * Action-based input across keyboard, pointer and gamepad.
 *
 * ```ts
 * const input = new Input(game, {
 *   bindings: { left: ["ArrowLeft", "KeyA", "PadLeft"], jump: ["Space", "PadA", "Pointer"] },
 * });
 * if (input.pressed("jump")) jump();
 * const dx = input.axis("left", "right");
 * ```
 *
 * Edges are cleared automatically after each simulation step.
 */
export class Input<A extends string> {
  readonly keys: Keyboard;
  readonly pointer: Pointer;
  readonly pads = new Gamepads();
  /**
   * The current bindings: Input's own copy of the options' map, read on every call. Change them with
   * `rebind()`, which keeps `keys.captured` in step.
   */
  readonly bindings: Bindings<A>;
  /**
   * Sources other code sets each step, by binding name: `TouchControls` writes `"TouchStickLeft"`, `"TouchA"` and
   * so on here. A binding found in this map reads from it instead of the keyboard.
   */
  readonly virtual = new Map<Binding, ButtonState>();
  private readonly unhook: () => void;
  private readonly captureKeys: boolean;
  /** Keys in `keys.captured` because a binding uses them (not ones the game added itself). */
  private readonly boundCaptured = new Set<string>();

  constructor(host: InputHost, options: InputOptions<A>) {
    this.bindings = { ...options.bindings };
    this.keys = new Keyboard(options.keyboardTarget ?? window);
    this.captureKeys = options.captureKeys ?? true;
    this.syncCaptured();
    // Call through the host so a class method keeps its `this`.
    this.pointer = new Pointer(host.canvas, (x, y) => host.toLogical(x, y));
    this.pointer.captureWheel = options.captureWheel ?? false;
    this.unhook = host.hooks.afterUpdate(() => this.endStep());
  }

  /** Any binding for the action is held. */
  down(action: A): boolean {
    return this.some(action, (b) =>
      this.isPointer(b)
        ? this.button(b).down
        : this.isPad(b)
          ? this.pads.down(b)
          : this.isTouch(b)
            ? this.touch(b).down
            : this.keys.down(b),
    );
  }

  /** The action started this step. */
  pressed(action: A): boolean {
    return this.some(action, (b) =>
      this.isPointer(b)
        ? this.button(b).pressed
        : this.isPad(b)
          ? this.pads.pressed(b)
          : this.isTouch(b)
            ? this.touch(b).pressed
            : this.keys.pressed(b),
    );
  }

  /** The action ended this step. */
  released(action: A): boolean {
    return this.some(action, (b) =>
      this.isPointer(b)
        ? this.button(b).released
        : this.isPad(b)
          ? this.pads.released(b)
          : this.isTouch(b)
            ? this.touch(b).released
            : this.keys.released(b),
    );
  }

  /**
   * Replace an action's bindings, e.g. from a controls menu: `input.rebind("jump", ["KeyK", "PadA"])`.
   * Takes a copy of `keys`, and updates `keys.captured` so the new keys stop scrolling the page and the old
   * ones scroll it again.
   */
  rebind(action: A, keys: readonly Binding[]): void {
    if (!Object.hasOwn(this.bindings, action))
      throw new Error(`Unknown input action "${action}". Known: ${Object.keys(this.bindings).join(", ")}`);
    this.bindings[action] = [...keys];
    this.syncCaptured();
  }

  /** -1, 0 or 1 from two opposing actions, e.g. `axis("left", "right")`. */
  axis(negative: A, positive: A): number {
    return (this.down(positive) ? 1 : 0) - (this.down(negative) ? 1 : 0);
  }

  dispose(): void {
    this.unhook();
    this.keys.dispose();
    this.pointer.dispose();
  }

  private some(action: A, test: (b: Binding) => boolean): boolean {
    const list = this.bindings[action];
    if (!list) throw new Error(`Unknown input action "${action}". Known: ${Object.keys(this.bindings).join(", ")}`);
    return list.some(test);
  }

  private syncCaptured(): void {
    if (!this.captureKeys) return;
    for (const code of this.boundCaptured) this.keys.captured.delete(code);
    this.boundCaptured.clear();
    for (const list of Object.values(this.bindings) as Binding[][]) {
      for (const b of list) {
        if (this.isPointer(b) || this.isPad(b) || this.isTouch(b) || this.keys.captured.has(b)) continue;
        this.keys.captured.add(b);
        this.boundCaptured.add(b);
      }
    }
  }

  private isPointer(b: Binding): boolean {
    return b === "Pointer" || b === "PointerRight" || b === "PointerMiddle";
  }

  private button(b: Binding): ButtonState {
    return b === "PointerRight" ? this.pointer.right : b === "PointerMiddle" ? this.pointer.middle : this.pointer;
  }

  private isPad(b: Binding): boolean {
    return b.startsWith("Pad");
  }

  private isTouch(b: Binding): boolean {
    return this.virtual.has(b) || b.startsWith("Touch");
  }

  /** An on-screen control's state; one that isn't set up (no `TouchControls` yet) is simply up. */
  private touch(b: Binding): ButtonState {
    return this.virtual.get(b) ?? UP;
  }

  /** Clear edges, then sample gamepads for the next step (the Gamepad API is poll-based). */
  private endStep(): void {
    this.keys.endStep();
    this.pointer.endStep();
    this.pads.poll();
  }
}
