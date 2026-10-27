import type { MenuPanelStyle } from "./menu.js";
import type { BarStyle } from "./panel.js";

/**
 * The default look: plain greys, a white focus, 4px corners and a thin border, so menus and panels sit under
 * any game's art without bringing a style of their own. Spread it to start from it:
 * `menu.drawPanel(draw, cx, cy, { ...neutral, title: "paused" })`.
 */
export const neutral = {
  borders: ["#3a3a40"],
  fill: "#141416",
  radius: 4,
  padding: 10,
  color: "#d4d4d8",
  focusColor: "#ffffff",
  disabledColor: "#71717a",
  highlight: "#2a2a2f",
  titleColor: "#a1a1aa",
} as const satisfies MenuPanelStyle;

/** `neutral` for light games: a white panel, dark text. */
export const neutralLight = {
  borders: ["#d4d4d8"],
  fill: "#fafafa",
  radius: 4,
  padding: 10,
  color: "#3f3f46",
  focusColor: "#09090b",
  disabledColor: "#a1a1aa",
  highlight: "#e4e4e7",
  titleColor: "#71717a",
} as const satisfies MenuPanelStyle;

/**
 * squish, debuff's own look and one style among others: a soft, round-cornered dark-olive panel with no
 * outline, a lime focus, and a jelly pill that squashes and springs back when focus moves.
 */
export const squish = {
  borders: [],
  fill: "#1b2014",
  radius: 10,
  padding: 10,
  color: "#d3dcc2",
  focusColor: "#cffb2d",
  disabledColor: "#6b7560",
  highlight: "#2a3320",
  squash: true,
  titleColor: "#ffffff",
} as const satisfies MenuPanelStyle;

/** Bars to match each look: `bar(draw, x, y, w, h, hp, squishBar)`. The default is `neutralBar`. */
export const neutralBar = { fill: "#e4e4e7", empty: "#3f3f46" } as const satisfies BarStyle;
export const neutralLightBar = { fill: "#3f3f46", empty: "#d4d4d8" } as const satisfies BarStyle;
export const squishBar = { fill: "#cffb2d", empty: "#2e3a1c" } as const satisfies BarStyle;
