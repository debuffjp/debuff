/** Maps client (event) coordinates to the game's logical coordinates. `Game.toLogical` fits. */
export type ToLogical = (clientX: number, clientY: number) => { x: number; y: number };

/** What made a pointer press: `PointerEvent.pointerType`, with anything unknown counted as a mouse. */
export type PointerKind = "mouse" | "touch" | "pen";

export interface TouchPoint {
  readonly id: number;
  x: number;
  y: number;
  /** Mouse, finger or pen. A held mouse button is a contact too. */
  readonly kind: PointerKind;
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
  /** What made the latest primary press: `"mouse"`, `"touch"` or `"pen"`. `"mouse"` until the first press. */
  kind: PointerKind = "mouse";
  /** Active contacts keyed by pointerId. */
  readonly touches = new Map<number, TouchPoint>();
  /** Contacts that started this step, cleared by `endStep()`. They are in `touches` too unless they also ended. */
  readonly touchesStarted: TouchPoint[] = [];
  /** Contacts that ended this step, at their last position, cleared by `endStep()`. */
  readonly touchesEnded: TouchPoint[] = [];
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
  /** The contact the primary pointer follows, while it's held through `touchStart`. */
  private primaryId: number | undefined;
  private readonly toLogical: ToLogical;

  private readonly onDown = (e: PointerEvent) => {
    // preventDefault below stops a click focusing the window, so inside an iframe (game portals) keys
    // would go nowhere until the player clicked outside the game. Take focus ourselves.
    if (!document.hasFocus()) window.focus();
    if (e.pointerType === "mouse") this.syncButtons(e.buttons);
    // Only the main mouse button is the primary pointer; right and middle are `right` and `middle`.
    if (e.pointerType === "mouse" && e.button) {
      this.element.setPointerCapture?.(e.pointerId);
      return;
    }
    this.element.setPointerCapture?.(e.pointerId);
    const { x, y } = this.toLogical(e.clientX, e.clientY);
    this.touchStart(e.pointerId, x, y, kindOf(e));
    e.preventDefault();
  };
  private readonly onMove = (e: PointerEvent) => {
    // A second button pressed or let go while another is held arrives as a move with `button` set.
    if (e.pointerType === "mouse" && e.button > 0) this.syncButtons(e.buttons);
    if (!this.touches.has(e.pointerId) && !e.isPrimary) return;
    const { x, y } = this.toLogical(e.clientX, e.clientY);
    if (this.touches.has(e.pointerId)) this.touchMove(e.pointerId, x, y);
    // A drag that started outside the element counts as a contact, but not as a press.
    else if (e.buttons) this.addContact(e.pointerId, x, y, kindOf(e));
    // Hover: the primary pointer follows the mouse while no button is down.
    if (e.isPrimary && e.pointerId !== this.primaryId) this.move(x, y);
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
    this.touchEnd(e.pointerId);
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

  /** Simulate pressing the primary pointer at logical coordinates, by a mouse unless `kind` says otherwise. */
  press(x: number, y: number, kind: PointerKind = "mouse"): void {
    this.x = x;
    this.y = y;
    if (this.down) return;
    this.down = true;
    this.pressed = true;
    this.kind = kind;
  }

  /** Simulate moving the primary pointer. */
  move(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Simulate releasing the primary pointer. */
  release(): void {
    this.primaryId = undefined;
    if (!this.down) return;
    this.down = false;
    this.released = true;
  }

  /**
   * Simulate a contact starting (a finger by default). The first contact while the primary pointer is up
   * also presses it, as real touches do.
   */
  touchStart(id: number, x: number, y: number, kind: PointerKind = "touch"): void {
    if (this.touches.has(id)) {
      this.touchMove(id, x, y);
      return;
    }
    this.addContact(id, x, y, kind);
    if (this.down) return;
    this.press(x, y, kind);
    this.primaryId = id;
  }

  /** Simulate a contact moving. The primary pointer follows its contact. */
  touchMove(id: number, x: number, y: number): void {
    const p = this.touches.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    if (id === this.primaryId) this.move(x, y);
  }

  /** Simulate a contact ending. Ending the primary pointer's contact releases it. */
  touchEnd(id: number): void {
    const p = this.touches.get(id);
    if (!p) return;
    this.touches.delete(id);
    this.touchesEnded.push(p);
    if (id === this.primaryId) this.release();
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
    this.touchesStarted.length = 0;
    this.touchesEnded.length = 0;
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

  private addContact(id: number, x: number, y: number, kind: PointerKind): void {
    const p = { id, x, y, kind };
    this.touches.set(id, p);
    this.touchesStarted.push(p);
  }
}

const kindOf = (e: PointerEvent): PointerKind => (e.pointerType === "touch" || e.pointerType === "pen" ? e.pointerType : "mouse");
