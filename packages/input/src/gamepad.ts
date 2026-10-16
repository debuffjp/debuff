/**
 * Button names for the W3C "standard" gamepad mapping, used in bindings as `"Pad<Name>"`,
 * e.g. `"PadA"`, `"PadUp"`. Stick directions (`PadStickLeft` …) treat the left stick as a d-pad.
 * https://w3c.github.io/gamepad/#remapping
 */
export const PAD_BUTTONS = {
  PadA: 0,
  PadB: 1,
  PadX: 2,
  PadY: 3,
  PadL1: 4,
  PadR1: 5,
  PadL2: 6,
  PadR2: 7,
  PadSelect: 8,
  PadStart: 9,
  PadL3: 10,
  PadR3: 11,
  PadUp: 12,
  PadDown: 13,
  PadLeft: 14,
  PadRight: 15,
} as const;

export type PadButton = keyof typeof PAD_BUTTONS;
export type PadStick = "PadStickUp" | "PadStickDown" | "PadStickLeft" | "PadStickRight";

/** Polls the first connected standard gamepad. The Gamepad API is poll-based, so call `poll()` once per step. */
export class Gamepads {
  /** Stick deflection needed to count as a direction. */
  deadzone = 0.4;
  private current = new Set<string>();
  private previous = new Set<string>();
  /** Left stick, -1..1, after the deadzone. */
  stickX = 0;
  stickY = 0;
  connected = false;

  poll(): void {
    [this.previous, this.current] = [this.current, this.previous];
    this.current.clear();
    const pad = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads().find((p) => p?.connected) : undefined;
    this.connected = Boolean(pad);
    this.stickX = 0;
    this.stickY = 0;
    if (!pad) return;
    for (const [name, index] of Object.entries(PAD_BUTTONS)) if (pad.buttons[index]?.pressed) this.current.add(name);
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    this.stickX = Math.abs(ax) > this.deadzone ? ax : 0;
    this.stickY = Math.abs(ay) > this.deadzone ? ay : 0;
    if (this.stickX < 0) this.current.add("PadStickLeft");
    if (this.stickX > 0) this.current.add("PadStickRight");
    if (this.stickY < 0) this.current.add("PadStickUp");
    if (this.stickY > 0) this.current.add("PadStickDown");
  }

  down(name: string): boolean {
    return this.current.has(name);
  }

  pressed(name: string): boolean {
    return this.current.has(name) && !this.previous.has(name);
  }

  released(name: string): boolean {
    return !this.current.has(name) && this.previous.has(name);
  }
}
