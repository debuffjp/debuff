/** Unified mouse/touch/pen input in the game's logical coordinates.
 *  Like `Keyboard`, edges are reported per simulation step; call `endStep()` after update. */
export interface PointerState {
  readonly id: number;
  x: number;
  y: number;
  down: boolean;
}

export interface PointerOptions {
  /** Logical game size, used to map client pixels onto the canvas. */
  width: number;
  height: number;
}

export class Pointer {
  /** Primary pointer position in logical coordinates. */
  x = 0;
  y = 0;
  private isDown = false;
  private pressedThisStep = false;
  private releasedThisStep = false;
  private readonly active = new Map<number, PointerState>();

  private readonly onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.track(e, true);
    if (e.isPrimary) this.press(this.x, this.y);
    e.preventDefault();
  };
  private readonly onMove = (e: PointerEvent) => this.track(e, this.active.get(e.pointerId)?.down ?? false);
  private readonly onUp = (e: PointerEvent) => {
    this.active.delete(e.pointerId);
    if (e.isPrimary) this.release();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: PointerOptions,
  ) {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
  }

  get held(): boolean {
    return this.isDown;
  }
  get pressed(): boolean {
    return this.pressedThisStep;
  }
  get released(): boolean {
    return this.releasedThisStep;
  }
  /** All active pointers (multi-touch). */
  get pointers(): Iterable<PointerState> {
    return this.active.values();
  }

  /** Programmatic input, used by scenarios and tests. */
  press(x: number, y: number): void {
    this.x = x;
    this.y = y;
    if (this.isDown) return;
    this.isDown = true;
    this.pressedThisStep = true;
  }

  move(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  release(): void {
    if (!this.isDown) return;
    this.isDown = false;
    this.releasedThisStep = true;
  }

  endStep(): void {
    this.pressedThisStep = false;
    this.releasedThisStep = false;
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
  }

  private track(e: PointerEvent, down: boolean): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.options.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.options.height;
    this.active.set(e.pointerId, { id: e.pointerId, x, y, down });
    if (e.isPrimary) this.move(x, y);
  }
}
