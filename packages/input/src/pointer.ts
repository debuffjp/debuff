/** Maps client (event) coordinates to the game's logical coordinates. `Game.toLogical` fits. */
export type ToLogical = (clientX: number, clientY: number) => { x: number; y: number };

export interface TouchPoint {
  readonly id: number;
  x: number;
  y: number;
}

/**
 * Unified mouse, touch and pen input via Pointer Events, in logical game coordinates.
 *
 * `x`, `y`, `down`, `pressed` and `released` describe the primary pointer. Edges are
 * latched until `endStep()`. All active contacts are in `touches` for multi-touch.
 */
export class Pointer {
  x = 0;
  y = 0;
  down = false;
  pressed = false;
  released = false;
  /** Active contacts keyed by pointerId. */
  readonly touches = new Map<number, TouchPoint>();

  private readonly element: HTMLElement;
  private readonly toLogical: ToLogical;

  private readonly onDown = (e: PointerEvent) => {
    this.element.setPointerCapture?.(e.pointerId);
    const p = this.track(e);
    if (e.isPrimary) this.press(p.x, p.y);
    e.preventDefault();
  };
  private readonly onMove = (e: PointerEvent) => {
    if (this.touches.has(e.pointerId) || e.isPrimary) this.track(e);
  };
  private readonly onUp = (e: PointerEvent) => {
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

  /** Clear edges. Call once after each simulation step. */
  endStep(): void {
    this.pressed = false;
    this.released = false;
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.onDown);
    this.element.removeEventListener("pointermove", this.onMove);
    this.element.removeEventListener("pointerup", this.onUp);
    this.element.removeEventListener("pointercancel", this.onUp);
  }

  private track(e: PointerEvent): TouchPoint {
    const { x, y } = this.toLogical(e.clientX, e.clientY);
    const point = { id: e.pointerId, x, y };
    if (e.buttons || e.type === "pointerdown") this.touches.set(e.pointerId, point);
    if (e.isPrimary) this.move(x, y);
    return point;
  }
}
