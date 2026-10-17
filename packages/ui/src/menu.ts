import type { DrawLike, InputLike } from "./draw-like.js";

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  /** Skipped by navigation and drawn dimmed. */
  disabled?: boolean;
}

export interface MenuActions<A extends string = string> {
  up: A;
  down: A;
  confirm: A;
  /** Optional; calls `onBack`. */
  back?: A;
}

export interface MenuOptions<A extends string = string> {
  /** Input action names. Default `{ up: "up", down: "down", confirm: "confirm" }`. */
  actions?: MenuActions<A>;
  onBack?: () => void;
  /** Wrap from the last item to the first. Default true. */
  wrap?: boolean;
}

export interface MenuStyle {
  font?: string;
  color?: string | number;
  focusColor?: string | number;
  disabledColor?: string | number;
  /** Pixels between rows. Default 12. */
  lineHeight?: number;
  align?: "left" | "center" | "right";
  /** Drawn before the focused label. Default "> ". */
  cursor?: string;
}

/**
 * A vertical list of choices for title screens, pause menus and settings. Navigates with your
 * existing input actions, so keyboard, gamepad and touch bindings all work.
 *
 * ```ts
 * const pause = new Menu([
 *   { label: "resume", onSelect: () => (paused = false) },
 *   { label: "restart", onSelect: reset },
 * ], { actions: { up: "up", down: "down", confirm: "jump" } });
 * // every step while paused: pause.update(input)
 * // render: pause.draw(draw, game.width / 2, 60, { align: "center" })
 * ```
 */
export class Menu<A extends string = string> {
  items: MenuItem[];
  focus = 0;
  wrap: boolean;
  onBack: (() => void) | undefined;
  private actions: MenuActions<A>;

  constructor(items: MenuItem[], options: MenuOptions<A> = {}) {
    this.items = items;
    this.actions = options.actions ?? ({ up: "up", down: "down", confirm: "confirm" } as MenuActions<A>);
    this.wrap = options.wrap ?? true;
    this.onBack = options.onBack;
    if (this.items[this.focus]?.disabled) this.move(1);
  }

  get focused(): MenuItem | undefined {
    return this.items[this.focus];
  }

  /** Move focus by `delta`, skipping disabled items. */
  move(delta: number): void {
    const n = this.items.length;
    if (n === 0) return;
    let i = this.focus;
    for (let tries = 0; tries < n; tries++) {
      const next = i + delta;
      if (!this.wrap && (next < 0 || next >= n)) return;
      i = (next + n) % n;
      if (!this.items[i]?.disabled) {
        this.focus = i;
        return;
      }
    }
  }

  /** Activate the focused item. */
  select(): void {
    const item = this.focused;
    if (item && !item.disabled) item.onSelect?.();
  }

  /** Read input for this step. Returns true if anything happened. */
  update(input: InputLike<A>): boolean {
    const a = this.actions;
    if (input.pressed(a.up)) this.move(-1);
    else if (input.pressed(a.down)) this.move(1);
    else if (input.pressed(a.confirm)) this.select();
    else if (a.back && input.pressed(a.back)) this.onBack?.();
    else return false;
    return true;
  }

  /** Draw the items as rows starting at (x, y). */
  draw(draw: DrawLike, x: number, y: number, style: MenuStyle = {}): void {
    const lh = style.lineHeight ?? 12;
    const cursor = style.cursor ?? "> ";
    const align = style.align ?? "left";
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i] as MenuItem;
      const focused = i === this.focus;
      const color = item.disabled ? (style.disabledColor ?? "#777") : focused ? (style.focusColor ?? "#fff") : (style.color ?? "#aaa");
      // Keep labels aligned whether or not they carry the cursor: pad unfocused rows on the left.
      const pad = align === "left" ? " ".repeat(cursor.length) : "";
      const label = focused ? `${cursor}${item.label}` : `${pad}${item.label}`;
      draw.text(
        label,
        x,
        y + i * lh,
        style.font === undefined ? { color, align, baseline: "top" } : { font: style.font, color, align, baseline: "top" },
      );
    }
  }

  inspect(): { focus: number; focused: string | undefined; items: string[] } {
    return { focus: this.focus, focused: this.focused?.label, items: this.items.map((i) => i.label) };
  }
}
