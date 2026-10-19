/**
 * Keyboard state by `KeyboardEvent.code` (layout-independent, e.g. `"KeyW"`, `"ArrowLeft"`, `"Space"`).
 *
 * Edges (`pressed`/`released`) are latched until `endStep()`, so a tap shorter than a
 * simulation step is never missed. `Input` calls `endStep()` for you.
 */
export class Keyboard {
  private readonly held = new Set<string>();
  private readonly pressedEdge = new Set<string>();
  private readonly releasedEdge = new Set<string>();
  private readonly target: Window | HTMLElement;

  /**
   * Keys whose browser default (scrolling with arrows/Space, find-as-you-type…) is blocked so an
   * embedded game doesn't move the page. Never applied while the user types in a form field.
   */
  readonly captured = new Set<string>();

  private readonly onDown = (e: Event) => {
    const k = e as KeyboardEvent;
    if (this.shouldCapture(k)) k.preventDefault();
    if (!k.repeat) this.press(k.code);
  };
  private readonly onUp = (e: Event) => {
    const k = e as KeyboardEvent;
    if (this.shouldCapture(k)) k.preventDefault();
    this.release(k.code);
  };
  private readonly onBlur = () => this.releaseAll();

  constructor(target: Window | HTMLElement = window) {
    this.target = target;
    target.addEventListener("keydown", this.onDown);
    target.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
    // With an element target, keyup goes elsewhere once focus leaves it, so held keys would stick.
    if (target !== window) target.addEventListener("focusout", this.onBlur);
  }

  /** Key is currently held. */
  down(code: string): boolean {
    return this.held.has(code);
  }

  /** Key went down since the last step. */
  pressed(code: string): boolean {
    return this.pressedEdge.has(code);
  }

  /** Key went up since the last step. */
  released(code: string): boolean {
    return this.releasedEdge.has(code);
  }

  /** Simulate a key press (scenarios, tests, on-screen buttons). */
  press(code: string): void {
    if (this.held.has(code)) return;
    this.held.add(code);
    this.pressedEdge.add(code);
  }

  /** Simulate a key release. */
  release(code: string): void {
    if (!this.held.delete(code)) return;
    this.releasedEdge.add(code);
  }

  releaseAll(): void {
    for (const code of [...this.held]) this.release(code);
  }

  /** Clear edges. Call once after each simulation step. */
  endStep(): void {
    this.pressedEdge.clear();
    this.releasedEdge.clear();
  }

  private shouldCapture(e: KeyboardEvent): boolean {
    if (!this.captured.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return false;
    const t = e.target as HTMLElement | null;
    const editable = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    return !editable;
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onDown);
    this.target.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    this.target.removeEventListener("focusout", this.onBlur);
  }
}
