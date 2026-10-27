import type { DrawLike, FontLike, InputLike } from "./draw-like.js";
import { type FrameStyle, panelAround } from "./panel.js";
import { neutral } from "./themes.js";

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
  /** CSS font or `BitmapFont`. Default: `draw.text`'s, debuff sans. */
  font?: FontLike;
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
  /** A pill behind the focused row. Default on with the default look (a style that sets no `color`), off otherwise; `false` turns it off. Before 0.19 the default look was squish's dark-green pill. */
  highlight?: string | number | false;
  /** The pill squashes wide and flat when focus moves, then springs back. Default false; `squish` turns it on. Before 0.19 it always squashed. */
  squash?: boolean;
}

export interface MenuPanelStyle extends MenuStyle, FrameStyle {
  title?: string;
  titleFont?: FontLike;
  titleColor?: string | number;
  /** Pixels between the title and the first row. Default 6. */
  titleGap?: number;
}

interface Layout {
  mirror: boolean;
  font: FontLike | undefined;
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
  /** Row boxes from the last draw, for pointer hits. */
  private rows: { x: number; y: number; w: number; h: number }[] = [];
  /** 1 right after focus moves, easing to 0 over a few updates: squashes the highlight. */
  private bump = 0;

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
        if (i !== this.focus) this.bump = 1;
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
    this.bump *= 0.72;
    if (this.bump < 0.01) this.bump = 0;
    // A tap is handled by the rows alone, so a pointer bound to "confirm" doesn't also select the focused row.
    if (input.pointer?.pressed) return this.tap(input.pointer.x, input.pointer.y);
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
  /**
   * Tap at logical (x, y), using the rows from the last draw. Selects the row; on a row with a value,
   * the left half lowers it and the right half raises it.
   */
  tap(x: number, y: number): boolean {
    const i = this.rows.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    const item = this.items[i];
    if (!item || item.disabled) return false;
    if (i !== this.focus) this.bump = 1;
    this.focus = i;
    const row = this.rows[i] as { x: number; w: number };
    if (item.change) item.change(x < row.x + row.w / 2 ? -1 : 1);
    else this.select();
    return true;
  }

  private layout(draw: DrawLike, style: MenuStyle, mirror = style.align === "center"): Layout {
    const font = style.font;
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
    this.rows = [];
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    // A style with no colours of its own gets the default look; one that sets `color` keeps exactly what it set.
    const own = style.color !== undefined;
    const pill = style.highlight === false ? undefined : (style.highlight ?? (own ? undefined : neutral.highlight));
    if (pill !== undefined && draw.circle && this.items.length) {
      const ry = y0 + this.focus * (l.rowH + l.gap);
      // Wider and flatter right after focus moves, springing back to its rest size.
      const bump = style.squash ? this.bump : 0;
      const sx = 1 + 0.12 * bump,
        sy = 1 - 0.25 * bump;
      const pw = (l.w + 8) * sx,
        ph = (l.rowH + 4) * sy;
      const px = x0 + l.w / 2 - pw / 2,
        py = ry + l.rowH / 2 - ph / 2;
      const r = Math.min(ph / 2, pw / 2);
      draw.rect(px + r, py, pw - r * 2, ph, pill);
      draw.circle(px + r, py + r, r, pill);
      draw.circle(px + pw - r, py + r, r, pill);
      if (ph > r * 2) {
        draw.rect(px, py + r, pw, ph - r * 2, pill);
        draw.circle(px + r, py + ph - r, r, pill);
        draw.circle(px + pw - r, py + ph - r, r, pill);
      }
    }
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i] as MenuItem;
      const focused = i === this.focus;
      const color = item.disabled
        ? (style.disabledColor ?? (own ? "#666" : neutral.disabledColor))
        : focused
          ? (style.focusColor ?? (own ? "#fff" : neutral.focusColor))
          : (style.color ?? neutral.color);
      const offset = style.align === "center" ? Math.floor((l.labelW - (l.widths[i] ?? 0)) / 2) : 0;
      const lx = x0 + l.gutter + offset;
      const ry = y0 + i * (l.rowH + l.gap);
      // Hit box: the full row width, extended into half the gap above and below so taps between rows land.
      this.rows.push({ x: x0, y: ry - Math.floor(l.gap / 2), w: l.w, h: l.rowH + l.gap });
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
        color: style.titleColor ?? style.focusColor ?? (style.color === undefined ? neutral.titleColor : "#fff"),
      });
    this.drawLayout(draw, at.x + Math.floor((w - menu.w) / 2), at.y + titleH, style, menu);
  }

  inspect(): { focus: number; focused: string | undefined; items: string[] } {
    return { focus: this.focus, focused: this.focused?.label, items: this.items.map((i) => i.label) };
  }
}
