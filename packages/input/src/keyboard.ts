/** Keyboard state sampled per simulation step. Call `endStep()` after each update so
 *  `pressed`/`released` report edges exactly once, regardless of frame rate. */
export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressedThisStep = new Set<string>();
  private readonly releasedThisStep = new Set<string>();
  private readonly onDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.press(e.code);
  };
  private readonly onUp = (e: KeyboardEvent) => this.release(e.code);
  private readonly onBlur = () => this.clear();

  constructor(private readonly target: Window | HTMLElement = window) {
    target.addEventListener("keydown", this.onDown as EventListener);
    target.addEventListener("keyup", this.onUp as EventListener);
    window.addEventListener("blur", this.onBlur);
  }

  /** Key currently held. Uses `KeyboardEvent.code`, e.g. "ArrowLeft", "KeyZ". */
  held(code: string): boolean {
    return this.down.has(code);
  }

  pressed(code: string): boolean {
    return this.pressedThisStep.has(code);
  }

  released(code: string): boolean {
    return this.releasedThisStep.has(code);
  }

  /** Programmatic input, used by scenarios and tests. */
  press(code: string): void {
    if (this.down.has(code)) return;
    this.down.add(code);
    this.pressedThisStep.add(code);
  }

  release(code: string): void {
    if (!this.down.delete(code)) return;
    this.releasedThisStep.add(code);
  }

  endStep(): void {
    this.pressedThisStep.clear();
    this.releasedThisStep.clear();
  }

  clear(): void {
    for (const code of [...this.down]) this.release(code);
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onDown as EventListener);
    this.target.removeEventListener("keyup", this.onUp as EventListener);
    window.removeEventListener("blur", this.onBlur);
  }
}

/** -1, 0 or 1 from a pair of keys; handy for movement axes. */
export function axis(keys: Keyboard, negative: readonly string[], positive: readonly string[]): number {
  const n = negative.some((k) => keys.held(k)) ? 1 : 0;
  const p = positive.some((k) => keys.held(k)) ? 1 : 0;
  return p - n;
}
