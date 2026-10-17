import type { DrawLike, InputLike } from "./draw-like.js";
import { type FrameStyle, panelAround } from "./panel.js";

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  /** Skipped by navigation and drawn dimmed. */
  disabled?: boolean;
  /** Shown in a right-hand column, e.g. a volume or "on"/"off". Read every draw. */
  value?: () => string;
  /** Left/right on this row (with `left`/`right` actions) call this with -1 or 1. */
  change?: (dir: -1 | 1) => void;
}

export interface MenuActions<A extends string = string> {
  up: A;
  down: A;
  confirm: A;
  /** Optional; calls `onBack`. */
  back?: A;
  /** Optional; adjust the focused row's value. */
  left?: A;
  right?: A;
}

export interface MenuOptions<A extends string = string> {
  /** Input action names. Default `{ up: "up", down: "down", confirm: "confirm" }`. */
  actions?: MenuActions<A>;
  onBack?: () => void;
  /** Wrap from the last item to the first. Default true. */
  wrap?: boolean;
}

export interface MenuStyle {
  /** Default "8px monospace". */
  font?: string;
  color?: string | number;
  focusColor?: string | number;
  disabledColor?: string | number;
  /** Extra pixels between rows. Default 3. */
  gap?: number;
  /** "left" lines labels up after the cursor; "center" centres each label. Default "left". */
  align?: "left" | "center";
  /** Drawn beside the focused label, in its own column so labels never shift. Default ">". */
  cursor?: string;
  /** Pixels between the cursor and its label. Default 4. */
  cursorGap?: number;
  /** Minimum pixels between the label column and the value column. Default 12. */
  valueGap?: number;
}

export interface MenuPanelStyle extends MenuStyle, FrameStyle {
  title?: string;
  titleFont?: string;
  titleColor?: string | number;
  /** Pixels between the title and the first row. Default 6. */
  titleGap?: number;
}

const FONT = "8px monospace";

interface Layout {
  mirror: boolean;
  font: string;
  gutter: number;
  cursorW: number;
  rowH: number;
  gap: number;
  labelW: number;
  widths: number[];
  values: (string | undefined)[];
  valueWidths: number[];
  w: number;
  h: number;
}

/**
 * A vertical list of choices for title screens, pause menus and settings. Navigates with your
 * existing input actions, so keyboard, gamepad and touch bindings all work. Layout is measured, so
 * rows, cursor and frame line up to the pixel with any font.
 *
 * ```ts
 * const pause = new Menu([
 *   { label: "resume", onSelect: () => (paused = false) },
 *   { label: "restart", onSelect: reset },
 * ], { actions: { up: "up", down: "down", confirm: "jump" } });
 * // every step while paused: pause.update(input)
 * // render: pause.drawPanel(draw, game.width / 2, game.height / 2, { title: "paused" })
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
    else if (a.left && input.pressed(a.left)) this.focused?.change?.(-1);
    else if (a.right && input.pressed(a.right)) this.focused?.change?.(1);
    else return false;
    return true;
  }

  /** `mirror` reserves the cursor column on the right too, so the labels sit on the box's centre. */
  private layout(draw: DrawLike, style: MenuStyle, mirror = style.align === "center"): Layout {
    const font = style.font ?? FONT;
    const cursor = draw.measure(style.cursor ?? ">", font);
    const gutter = cursor.w + (style.cursorGap ?? 4);
    let rowH = cursor.h;
    const widths = this.items.map((item) => {
      const m = draw.measure(item.label, font);
      rowH = Math.max(rowH, m.h);
      return m.w;
    });
    const labelW = Math.max(0, ...widths);
    const values = this.items.map((item) => item.value?.());
    const valueWidths = values.map((v) => (v ? draw.measure(v, font).w : 0));
    const valueW = Math.max(0, ...valueWidths);
    const gap = style.gap ?? 3;
    const n = this.items.length;
    const w = labelW + gutter * (mirror ? 2 : 1) + (valueW ? (style.valueGap ?? 12) + valueW : 0);
    return {
      mirror,
      font,
      gutter,
      cursorW: cursor.w,
      rowH,
      gap,
      labelW,
      widths,
      values,
      valueWidths,
      w,
      h: n ? n * rowH + (n - 1) * gap : 0,
    };
  }

  /** The box `draw` fills with this style, in logical pixels. */
  measure(draw: DrawLike, style: MenuStyle = {}): { w: number; h: number } {
    const { w, h } = this.layout(draw, style);
    return { w, h };
  }

  /** Draw the rows with their box's top-left at (x, y). Positions snap to whole pixels. */
  draw(draw: DrawLike, x: number, y: number, style: MenuStyle = {}): void {
    this.drawLayout(draw, x, y, style, this.layout(draw, style));
  }

  private drawLayout(draw: DrawLike, x: number, y: number, style: MenuStyle, l: Layout): void {
    const mirror = l.mirror;
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i] as MenuItem;
      const focused = i === this.focus;
      const color = item.disabled ? (style.disabledColor ?? "#666") : focused ? (style.focusColor ?? "#fff") : (style.color ?? "#999");
      const offset = style.align === "center" ? Math.floor((l.labelW - (l.widths[i] ?? 0)) / 2) : 0;
      const lx = x0 + l.gutter + offset;
      const ry = y0 + i * (l.rowH + l.gap);
      draw.text(item.label, lx, ry, { font: l.font, color });
      if (focused) draw.text(style.cursor ?? ">", lx - l.gutter, ry, { font: l.font, color });
      const value = l.values[i];
      // Values are right-aligned to the box edge, so a column of numbers lines up.
      if (value) draw.text(value, x0 + l.w - (mirror ? l.gutter : 0) - (l.valueWidths[i] ?? 0), ry, { font: l.font, color });
    }
  }

  /** A framed menu with an optional title, centred on (cx, cy). */
  drawPanel(draw: DrawLike, cx: number, cy: number, style: MenuPanelStyle = {}): void {
    const menu = this.layout(draw, style, true);
    const titleFont = style.titleFont ?? menu.font;
    const title = style.title ? draw.measure(style.title, titleFont) : { w: 0, h: 0 };
    const titleH = style.title ? title.h + (style.titleGap ?? 6) : 0;
    const w = Math.max(menu.w, title.w);
    const at = panelAround(draw, cx, cy, w, titleH + menu.h, style);
    if (style.title)
      draw.text(style.title, at.x + Math.floor((w - title.w) / 2), at.y, {
        font: titleFont,
        color: style.titleColor ?? style.focusColor ?? "#fff",
      });
    this.drawLayout(draw, at.x + Math.floor((w - menu.w) / 2), at.y + titleH, style, menu);
  }

  inspect(): { focus: number; focused: string | undefined; items: string[] } {
    return { focus: this.focus, focused: this.focused?.label, items: this.items.map((i) => i.label) };
  }
}
