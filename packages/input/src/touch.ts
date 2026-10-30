import type { Input } from "./input.js";
import type { ButtonState, TouchPoint } from "./pointer.js";

/** The parts of `Game` that `TouchControls` uses. */
export interface TouchHost {
  /** Logical size, so positions can count from the right and bottom edges. */
  width: number;
  height: number;
  hooks: { beforeUpdate(fn: (dt: number) => void): () => void };
}

/**
 * A position in logical units. A negative value counts from the far edge: `{ x: -32, y: -32 }` is 32 units in
 * from the bottom-right corner, so the layout holds when the game's size changes (`scale: "expand"`).
 */
export interface TouchSpot {
  x: number;
  y: number;
  /** Touch radius. Default 24 for the stick, 16 for a button. */
  radius?: number;
}

export interface TouchStickOptions extends TouchSpot {
  /**
   * Where a thumb may land to grab the stick, as `[x, y, width, height]` (negative x and y count from the far
   * edge, like a spot). With a zone the stick is floating: it centres wherever the thumb lands in it. Without
   * one it stays at `x`, `y` and takes touches within twice its radius.
   */
  zone?: [number, number, number, number];
  /** How far (0 to 1) the knob must move before a direction counts as held. Default 0.3. */
  deadzone?: number;
}

export interface TouchControlsOptions {
  /** A stick, read as `TouchStickLeft`, `TouchStickRight`, `TouchStickUp` and `TouchStickDown`. */
  stick?: TouchStickOptions;
  /** Buttons by name, read as `Touch<name>`: `{ A: { x: -24, y: -24 } }` is `"TouchA"`. */
  buttons?: Record<string, TouchSpot>;
  /** `"touch"` (default): visible from the first touch, so mouse and keyboard players never see them. */
  show?: "touch" | "always" | "never";
}

/** The stick as it is this step. */
export interface TouchStick {
  /** Analog position, -1 (left, up) to 1 (right, down), 0 when not held. Longer than 1 never. */
  x: number;
  y: number;
  /** A thumb is on it. */
  held: boolean;
  /** Where it's centred and where the knob is, in logical units (the floating centre while held). */
  centerX: number;
  centerY: number;
  knobX: number;
  knobY: number;
  radius: number;
}

/** A button as it is this step, with where it is. */
export interface TouchButton extends ButtonState {
  x: number;
  y: number;
  radius: number;
}

/** Shapes `draw()` needs: debuff's `Draw` fits. */
export interface TouchDraw {
  alpha: number;
  circle(x: number, y: number, radius: number, color: string | number): void;
}

const DIRECTIONS = ["Left", "Right", "Up", "Down"] as const;

/**
 * On-screen controls for touch screens: a stick and buttons that feed the same actions as keys and pads.
 *
 * ```ts
 * const input = new Input(game, {
 *   bindings: {
 *     left: ["ArrowLeft", "PadStickLeft", "TouchStickLeft"],
 *     right: ["ArrowRight", "PadStickRight", "TouchStickRight"],
 *     jump: ["Space", "PadA", "TouchA"],
 *   },
 * });
 * const touch = new TouchControls(game, input, {
 *   stick: { x: 40, y: -40, zone: [0, 0, 160, -1] }, // floats anywhere on the left
 *   buttons: { A: { x: -32, y: -32 } },
 * });
 * // in render, outside the camera:
 * touch.draw(draw);
 * ```
 *
 * Each contact belongs to the control it started on until the finger lifts, so sliding off a button keeps
 * it held and the stick keeps its thumb. The contacts are the pointer's (`input.pointer.touches`), so they
 * also move the primary pointer; check `touch.holding` or `touch.owns(id)` to ignore them in pointer code.
 * Tests and agents drive it with `input.pointer.touchStart`, `touchMove` and `touchEnd`.
 *
 * How the controls look is the game's call: `draw()` is plain circles; read `stick` and `buttons` to draw
 * your own.
 */
export class TouchControls {
  /** Undefined when there's no stick. */
  readonly stick: TouchStick | undefined;
  readonly buttons: Record<string, TouchButton> = {};
  /** Whether `draw()` draws anything, and whether controls take touches. Set it yourself to override `show`. */
  visible: boolean;

  private readonly owner = new Map<number, string>();
  private readonly off: () => void;

  constructor(
    private readonly host: TouchHost,
    private readonly input: Input<string>,
    private readonly options: TouchControlsOptions,
  ) {
    const show = options.show ?? "touch";
    this.visible = show === "always";
    if (options.stick) {
      const r = options.stick.radius ?? 24;
      this.stick = { x: 0, y: 0, held: false, centerX: 0, centerY: 0, knobX: 0, knobY: 0, radius: r };
      for (const d of DIRECTIONS) input.virtual.set(`TouchStick${d}`, { down: false, pressed: false, released: false });
    }
    for (const name of Object.keys(options.buttons ?? {})) {
      const state: TouchButton = { down: false, pressed: false, released: false, x: 0, y: 0, radius: 0 };
      this.buttons[name] = state;
      input.virtual.set(`Touch${name}`, state);
    }
    this.layout();
    this.off = host.hooks.beforeUpdate(() => this.update());
  }

  /** A control is held. */
  get holding(): boolean {
    return this.owner.size > 0;
  }

  /** Contact `id` (a `TouchPoint.id`) belongs to a control. */
  owns(id: number): boolean {
    return this.owner.has(id);
  }

  /** Plain circles for the stick and buttons, in logical units: call it outside `withCamera`. */
  draw(draw: TouchDraw, style: { color?: string | number; alpha?: number } = {}): void {
    if (!this.visible) return;
    const color = style.color ?? "#ffffff";
    const alpha = style.alpha ?? 0.35;
    const before = draw.alpha;
    const s = this.stick;
    if (s) {
      draw.alpha = alpha * 0.6;
      draw.circle(s.centerX, s.centerY, s.radius, color);
      draw.alpha = s.held ? alpha * 1.6 : alpha;
      draw.circle(s.knobX, s.knobY, s.radius * 0.45, color);
    }
    for (const b of Object.values(this.buttons)) {
      draw.alpha = b.down ? alpha * 1.8 : alpha;
      draw.circle(b.x, b.y, b.radius, color);
    }
    draw.alpha = before;
  }

  /** Stop reading touches and remove the controls' sources from the input. */
  dispose(): void {
    this.off();
    if (this.stick) for (const d of DIRECTIONS) this.input.virtual.delete(`TouchStick${d}`);
    for (const name of Object.keys(this.buttons)) this.input.virtual.delete(`Touch${name}`);
  }

  private update(): void {
    this.layout();
    const pointer = this.input.pointer;
    const show = this.options.show ?? "touch";
    for (const c of pointer.touchesStarted) {
      if (show === "touch" && c.kind !== "mouse") this.visible = true;
      if (!this.visible || this.owner.has(c.id)) continue;
      const hit = this.hit(c);
      if (!hit) continue;
      this.owner.set(c.id, hit);
      if (hit === "stick" && this.stick && this.options.stick?.zone) {
        this.stick.centerX = c.x;
        this.stick.centerY = c.y;
      }
    }

    // A contact that started and ended within one step (a quick tap) is in touchesStarted but not touches.
    const tapped = new Set<string>();
    const held = new Set<string>();
    let thumb: TouchPoint | undefined;
    for (const [id, control] of this.owner) {
      const c = pointer.touches.get(id);
      if (!c) {
        if (pointer.touchesStarted.some((s) => s.id === id)) tapped.add(control);
        this.owner.delete(id);
        continue;
      }
      held.add(control);
      if (control === "stick") thumb ??= c;
    }

    for (const [name, b] of Object.entries(this.buttons)) this.set(b, held.has(name), tapped.has(name));
    if (this.stick) this.updateStick(thumb);
  }

  private updateStick(thumb: TouchPoint | undefined): void {
    const s = this.stick as TouchStick;
    const o = this.options.stick as TouchStickOptions;
    if (!thumb) {
      // Let go: back to its resting place (a floating stick returns from wherever the thumb landed).
      s.held = false;
      s.x = s.y = 0;
      s.centerX = this.at(o.x, this.host.width);
      s.centerY = this.at(o.y, this.host.height);
    } else {
      s.held = true;
      const dx = thumb.x - s.centerX;
      const dy = thumb.y - s.centerY;
      const len = Math.hypot(dx, dy);
      const k = len > s.radius ? s.radius / len : 1;
      s.x = (dx * k) / s.radius;
      s.y = (dy * k) / s.radius;
    }
    s.knobX = s.centerX + s.x * s.radius;
    s.knobY = s.centerY + s.y * s.radius;
    const dz = o.deadzone ?? 0.3;
    const on = { Left: s.x < -dz, Right: s.x > dz, Up: s.y < -dz, Down: s.y > dz };
    for (const d of DIRECTIONS) this.set(this.input.virtual.get(`TouchStick${d}`) as ButtonState, on[d], false);
  }

  /** Down this step, with edges against last step's; a tap within the step is pressed and released at once. */
  private set(b: ButtonState, down: boolean, tapped: boolean): void {
    const was = b.down;
    b.down = down;
    b.pressed = (down && !was) || (tapped && !was);
    b.released = (!down && was) || tapped;
  }

  /** Which control a new contact lands on: buttons first (they're small), then the stick. */
  private hit(c: TouchPoint): string | undefined {
    for (const [name, b] of Object.entries(this.buttons)) if ((c.x - b.x) ** 2 + (c.y - b.y) ** 2 <= b.radius ** 2) return name;
    const s = this.stick;
    const o = this.options.stick;
    if (!s || !o) return undefined;
    if (o.zone) {
      const [zx, zy, zw, zh] = o.zone;
      const x0 = this.at(zx, this.host.width);
      const y0 = this.at(zy, this.host.height);
      const x1 = zw < 0 ? this.host.width + zw + 1 : x0 + zw;
      const y1 = zh < 0 ? this.host.height + zh + 1 : y0 + zh;
      return c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1 ? "stick" : undefined;
    }
    return (c.x - s.centerX) ** 2 + (c.y - s.centerY) ** 2 <= (s.radius * 2) ** 2 ? "stick" : undefined;
  }

  /** Place the buttons and an idle stick for the game's current size. */
  private layout(): void {
    const { width, height } = this.host;
    for (const [name, spot] of Object.entries(this.options.buttons ?? {})) {
      const b = this.buttons[name] as TouchButton;
      b.x = this.at(spot.x, width);
      b.y = this.at(spot.y, height);
      b.radius = spot.radius ?? 16;
    }
    const s = this.stick;
    const o = this.options.stick;
    if (s && o && !s.held) {
      s.centerX = this.at(o.x, width);
      s.centerY = this.at(o.y, height);
      s.knobX = s.centerX + s.x * s.radius;
      s.knobY = s.centerY + s.y * s.radius;
    }
  }

  private at(v: number, size: number): number {
    return v < 0 ? size + v : v;
  }
}
