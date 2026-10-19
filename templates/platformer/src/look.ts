import type { Draw } from "@debuffjp/core";
import type { Tilemap } from "@debuffjp/tilemap";

// The squish look: soft, flat, rounded shapes in a small palette. Everything is drawn in code, no sprites.

export const INK = "#11140d";
export const PANEL = "#1b2014";
export const PANEL_ALT = "#20261a";
export const PANEL_HI = "#2a3320";
export const TEXT = "#d3dcc2";
export const MUTED = "#6b7560";
export const LIME = "#cffb2d";
export const SKY = "#38bdf8";
export const PINK = "#f472b6";
export const AMBER = "#fbbf24";
export const LILAC = "#a78bfa";
export const MINT = "#34d399";

/** Which corners of a box to round. */
export interface Corners {
  tl?: boolean;
  tr?: boolean;
  bl?: boolean;
  br?: boolean;
}
const ALL: Corners = { tl: true, tr: true, bl: true, br: true };

/** A box with round corners of radius `r`, made of rects and circles. Square corners where `corners` says no. */
export function roundRect(draw: Draw, x: number, y: number, w: number, h: number, r: number, colour: string, corners = ALL) {
  r = Math.min(r, w / 2, h / 2);
  draw.rect(x + r, y, w - 2 * r, h, colour);
  draw.rect(x, y + r, w, h - 2 * r, colour);
  const corner = (on: boolean | undefined, cx: number, cy: number) =>
    on ? draw.circle(cx, cy, r, colour) : draw.rect(cx - r, cy - r, r * 2, r * 2, colour);
  corner(corners.tl, x + r, y + r);
  corner(corners.tr, x + w - r, y + r);
  corner(corners.bl, x + r, y + h - r);
  corner(corners.br, x + w - r, y + h - r);
}

/** Text in debuff sans, scaled up and centred on x. */
export function bigText(draw: Draw, text: string, x: number, y: number, size: number, colour: string) {
  draw.push();
  draw.translate(x, y);
  draw.scale(size);
  draw.text(text, 0, 0, { color: colour, align: "center" });
  draw.pop();
}

/**
 * A squish blob standing with its feet at (x, y): a rounded square with two dot eyes.
 * It squashes and stretches from the feet, and `lean` tips it (radians) like it's running into the wind.
 */
export function blob(
  draw: Draw,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  o: { scaleX: number; scaleY: number; lean: number; look: number },
) {
  draw.push();
  draw.translate(x, y);
  draw.rotate(o.lean);
  draw.scale(o.scaleX, o.scaleY);
  roundRect(draw, -w / 2, -h, w, h, Math.min(w, h) * 0.4, colour);
  // Eyes peek the way it's facing.
  const ex = o.look * w * 0.12;
  draw.circle(ex - w * 0.18, -h * 0.58, 1.3, INK);
  draw.circle(ex + w * 0.18, -h * 0.58, 1.3, INK);
  draw.pop();
}

// Tile ids in assets/level1.tmj: 1 ground top, 2 ground fill, 3 one-way platform, 4 solid block.
const GROUND_TOP = 1;
const ONE_WAY = 3;
const BLOCK = 4;

/** Draw the map's tiles as soft blocks and pills, only the ones on screen. */
export function drawLevel(draw: Draw, map: Tilemap, layer: string, view: { x: number; y: number; w: number; h: number }) {
  const s = map.tileWidth;
  const solid = (c: number, r: number) => {
    const id = map.get(layer, c, r);
    return id !== 0 && id !== ONE_WAY;
  };
  const c0 = Math.max(0, Math.floor(view.x / s));
  const c1 = Math.min(map.width - 1, Math.floor((view.x + view.w) / s));
  const r0 = Math.max(0, Math.floor(view.y / s));
  const r1 = Math.min(map.height - 1, Math.floor((view.y + view.h) / s));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const id = map.get(layer, c, r);
      if (!id) continue;
      const x = c * s,
        y = r * s;
      if (id === ONE_WAY) {
        // A pill: rounded only where the platform ends.
        const left = map.get(layer, c - 1, r) !== ONE_WAY,
          right = map.get(layer, c + 1, r) !== ONE_WAY;
        roundRect(draw, x, y, s, 6, 3, LILAC, { tl: left, bl: left, tr: right, br: right });
        continue;
      }
      // Round a corner when both tiles beside it are open, so groups of tiles read as one soft lump.
      const up = !solid(c, r - 1),
        down = !solid(c, r + 1) && r < map.height - 1,
        left = !solid(c - 1, r) && c > 0,
        right = !solid(c + 1, r) && c < map.width - 1;
      const corners = { tl: up && left, tr: up && right, bl: down && left, br: down && right };
      const colour = id === BLOCK ? PANEL_HI : id === GROUND_TOP ? PANEL_ALT : PANEL;
      roundRect(draw, x, y, s, s, 5, colour, corners);
      // A quiet mint lip on top of the ground.
      if (up && id === GROUND_TOP) roundRect(draw, x, y, s, 3, 1.5, MINT, { tl: left, bl: left, tr: right, br: right });
    }
}
