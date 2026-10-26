/** Maps client (event) coordinates to the game's logical coordinates. `Game.toLogical` fits. */
export type ToLogical = (clientX: number, clientY: number) => { x: number; y: number };

export interface TouchPoint {
  readonly id: number;
  x: number;
  y: number;
}

/** A mouse button other than the main one. */
export type PointerButton = "right" | "middle";

/** Held state and this step's edges for one button, like the primary pointer's. */
export interface ButtonState {
  down: boolean;
  pressed: boolean;
  released: boolean;
}

// `PointerEvent.buttons` bits.
const BUTTON_BITS: Record<PointerButton, number> = { right: 2, middle: 4 };

/**
 * Unified mouse, touch and pen input via Pointer Events, in logical game coordinates.
 *
 * `x`, `y`, `down`, `pressed` and `released` describe the primary pointer. Edges are
 * latched until `endStep()`. All active contacts are in `touches` for multi-touch. The right and
 * middle mouse buttons are in `right` and `middle`.
 */
export class Pointer {
  x = 0;
  y = 0;
  down = false;
  pressed = false;
  released = false;
  /** Active contacts keyed by pointerId. */
  readonly touches = new Map<number, TouchPoint>();
  /**
   * Vertical wheel (or trackpad) scroll over the element this step, in CSS pixels: positive scrolls down.
   * Summed across events and reset by `endStep()`.
   */
  wheel = 0;
  /** Horizontal scroll this step, like `wheel`: positive scrolls right. */
  wheelX = 0;
  /** The right mouse button (or a pen's barrel button reported as one). */
  readonly right: ButtonState = { down: false, pressed: false, released: false };
  /** The middle mouse button (wheel click). */
  readonly middle: ButtonState = { down: false, pressed: false, released: false };
  /** Block the page scrolling while the wheel is over the element (for wheel zoom in embeds). Default false. */
  captureWheel = false;

  private readonly element: HTMLElement;
  private readonly toLogical: ToLogical;

  private readonly onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") this.syncButtons(e.buttons);
    // Only the main mouse button is the primary pointer; right and middle are `right` and `middle`.
    if (e.pointerType === "mouse" && e.button) {
      this.element.setPointerCapture?.(e.pointerId);
      return;
    }
    this.element.setPointerCapture?.(e.pointerId);
    const p = this.track(e);
    if (e.isPrimary) this.press(p.x, p.y);
    e.preventDefault();
  };
  private readonly onMove = (e: PointerEvent) => {
    // A second button pressed or let go while another is held arrives as a move with `button` set.
    if (e.pointerType === "mouse" && e.button > 0) this.syncButtons(e.buttons);
    if (this.touches.has(e.pointerId) || e.isPrimary) this.track(e);
  };
  // Right-click shouldn't open the browser menu over a game.
  private readonly onContextMenu = (e: Event) => e.preventDefault();
  private readonly onWheel = (e: WheelEvent) => {
    if (this.captureWheel) e.preventDefault();
    // Lines and pages (Firefox, some mice) become pixels, so games see one unit everywhere.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.element.clientHeight || 800 : 1;
    this.scroll(e.deltaY * unit, e.deltaX * unit);
  };
  private readonly onUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse") this.syncButtons(e.buttons);
    this.touches.delete(e.pointerId);
    if (e.isPrimary) this.release();
  };

  constructor(element: HTMLElement, toLogical: ToLogical) {
    this.element = element;
    this.toLogical = toLogical;
    element.style.touchAction = "none";
    element.addEventListener("pointerdown", this.onDown);
    element.addEventListener("pointermove", this.onMove);
    element.addEventListener("pointerup", this.onUp);
    element.addEventListener("pointercancel", this.onUp);
    element.addEventListener("contextmenu", this.onContextMenu);
    // Not passive, so `captureWheel` can stop the page scrolling.
    element.addEventListener("wheel", this.onWheel, { passive: false });
  }

  /** Simulate pressing the primary pointer at logical coordinates. */
  press(x: number, y: number): void {
    this.x = x;
    this.y = y;
    if (this.down) return;
    this.down = true;
    this.pressed = true;
  }

  /** Simulate moving the primary pointer. */
  move(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Simulate releasing the primary pointer. */
  release(): void {
    if (!this.down) return;
    this.down = false;
    this.released = true;
  }

  /** Simulate pressing the right or middle button. */
  pressButton(button: PointerButton): void {
    const b = this[button];
    if (b.down) return;
    b.down = true;
    b.pressed = true;
  }

  /** Simulate releasing the right or middle button. */
  releaseButton(button: PointerButton): void {
    const b = this[button];
    if (!b.down) return;
    b.down = false;
    b.released = true;
  }

  /** Simulate scrolling the wheel by `dy` (and `dx`) CSS pixels. */
  scroll(dy: number, dx = 0): void {
    this.wheel += dy;
    this.wheelX += dx;
  }

  /** Clear edges and the wheel. Call once after each simulation step. */
  endStep(): void {
    this.pressed = false;
    this.released = false;
    this.wheel = 0;
    this.wheelX = 0;
    for (const b of [this.right, this.middle]) b.pressed = b.released = false;
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.onDown);
    this.element.removeEventListener("pointermove", this.onMove);
    this.element.removeEventListener("pointerup", this.onUp);
    this.element.removeEventListener("pointercancel", this.onUp);
    this.element.removeEventListener("contextmenu", this.onContextMenu);
    this.element.removeEventListener("wheel", this.onWheel);
  }

  private syncButtons(buttons: number): void {
    for (const button of ["right", "middle"] as const) {
      if (buttons & BUTTON_BITS[button]) this.pressButton(button);
      else this.releaseButton(button);
    }
  }

  private track(e: PointerEvent): TouchPoint {
    const { x, y } = this.toLogical(e.clientX, e.clientY);
    const point = { id: e.pointerId, x, y };
    if (e.buttons || e.type === "pointerdown") this.touches.set(e.pointerId, point);
    if (e.isPrimary) this.move(x, y);
    return point;
  }
}
