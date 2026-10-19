import type { Draw } from "@debuffjp/core";

// Everything in mossfell is drawn in code, in debuff's "squish" look: soft, round, flat shapes and dot eyes.

/** The squish palette. Use only these. */
export const C = {
  ink: "#11140d",
  panel: "#1b2014",
  panelAlt: "#20261a",
  panelHi: "#2a3320",
  text: "#d3dcc2",
  muted: "#6b7560",
  lime: "#cffb2d",
  sky: "#38bdf8",
  pink: "#f472b6",
  amber: "#fbbf24",
  lilac: "#a78bfa",
  mint: "#34d399",
};

/** Tile ids in assets/world.tmj (the `ground` layer). */
export const TILE = { grass: 1, tree: 2, bush: 3, pond: 4, path: 5, floor: 6, wall: 7, door: 8, stairs: 9, tuft: 10 };

/** Something that can squash and stretch: `squash()` and `Tweens` animate these two numbers. */
export interface Look {
  scaleX: number;
  scaleY: number;
}

/** A rectangle with round corners, built from rects and circles. */
export function roundRect(draw: Draw, x: number, y: number, w: number, h: number, r: number, colour: string): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  draw.rect(x + r, y, w - r * 2, h, colour);
  draw.rect(x, y + r, w, h - r * 2, colour);
  for (const [cx, cy] of [
    [x + r, y + r],
    [x + w - r, y + r],
    [x + r, y + h - r],
    [x + w - r, y + h - r],
  ] as const)
    draw.circle(cx, cy, r, colour);
}

/** Text in debuff sans, scaled up from its centre. */
export function bigText(draw: Draw, text: string, x: number, y: number, size: number, colour: string): void {
  draw.push();
  draw.translate(x, y);
  draw.scale(size);
  draw.text(text, 0, 0, { color: colour, align: "center", baseline: "middle" });
  draw.pop();
}

/** A small number hashed from a tile position, so each tree and tuft is a little different but never flickers. */
const hash = (col: number, row: number) => {
  const n = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/**
 * Draw the tiles in view. Trees go last so their round tops spill over the ground around them.
 * `get` reads a tile id; `col0..row1` is the range of tiles to draw; columns from `hollowCol` on are the dungeon.
 */
export function drawGround(
  draw: Draw,
  get: (col: number, row: number) => number,
  col0: number,
  row0: number,
  col1: number,
  row1: number,
  hollowCol: number,
): void {
  const T = 16;
  const trees: [number, number][] = [];
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const id = get(col, row);
      if (!id) continue;
      const x = col * T;
      const y = row * T;
      const hollow = col >= hollowCol;
      draw.rect(x, y, T, T, hollow ? C.panel : C.panelAlt);
      // Soft bands: each tile rounds only the corners with no same-kind neighbour, so paths, ponds and walls
      // join into smooth shapes.
      const band = (colour: string) => {
        const same = (dc: number, dr: number) => get(col + dc, row + dr) === id;
        const r = 6;
        draw.rect(x + r, y, T - r * 2, T, colour);
        draw.rect(x, y + r, T, T - r * 2, colour);
        for (const [dc, dr] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          const cx = dc < 0 ? x : x + T - r;
          const cy = dr < 0 ? y : y + T - r;
          if (same(dc, 0) || same(0, dr)) draw.rect(cx, cy, r, r, colour);
          else draw.circle(dc < 0 ? cx + r : cx, dr < 0 ? cy + r : cy, r, colour);
        }
      };
      if (id === TILE.path) band(C.panelHi);
      else if (id === TILE.pond) {
        band(C.sky);
        if (hash(col, row) > 0.6) roundRect(draw, x + 4, y + 7, 7, 2, 1, C.text);
      } else if (id === TILE.wall) band(C.panelHi);
      else if (id === TILE.floor && hash(col, row) > 0.85) draw.circle(x + 8, y + 8, 1.5, C.panelAlt);
      else if (id === TILE.tuft) {
        const h = hash(col, row);
        roundRect(draw, x + 4 + h * 4, y + 6, 2, 5, 1, C.panelHi);
        roundRect(draw, x + 7 + h * 4, y + 4, 2, 7, 1, C.panelHi);
        roundRect(draw, x + 10 + h * 4, y + 7, 2, 4, 1, C.panelHi);
      } else if (id === TILE.bush) {
        draw.circle(x + 8, y + 11, 7, C.panel);
        draw.circle(x + 5, y + 8, 4.5, C.mint);
        draw.circle(x + 11, y + 8, 4.5, C.mint);
        draw.circle(x + 8, y + 5.5, 4.5, C.mint);
        draw.circle(x + 6, y + 7, 1.2, C.pink);
        draw.circle(x + 10.5, y + 5, 1.2, C.pink);
      } else if (id === TILE.door) {
        roundRect(draw, x + 1, y + 1, T - 2, T - 1, 5, C.amber);
        draw.circle(x + 8, y + 7, 2, C.ink);
        draw.rect(x + 7.25, y + 8, 1.5, 4, C.ink);
      } else if (id === TILE.stairs) {
        roundRect(draw, x + 1, y + 1, T - 2, T - 2, 5, C.ink);
        for (let i = 0; i < 3; i++) roundRect(draw, x + 3 + i, y + 3 + i * 4, T - 6 - i * 2, 2.5, 1.25, C.muted);
      } else if (id === TILE.tree) trees.push([col, row]);
    }
  }
  // Trees: a soft shadow under every crown first, then the crowns, so neighbours merge into one round canopy.
  for (const [col, row] of trees) draw.circle(col * T + 8.5, row * T + 10, 7.5, C.panel);
  for (const [col, row] of trees) {
    const h = hash(col, row);
    draw.circle(col * T + 8 + (h - 0.5), row * T + 7 + (h - 0.5) * 2, 7.5, C.mint);
  }
}

/** Two ink dot eyes, looking a little toward (lookX, lookY). */
export function eyes(draw: Draw, gap: number, size: number, lookX = 0, lookY = 0): void {
  draw.circle(-gap + lookX, lookY, size, C.ink);
  draw.circle(gap + lookX, lookY, size, C.ink);
}

/**
 * The hero: a round lilac blob. Drawn around its feet at (x, y) so squashing keeps it on the ground.
 * `facing` turns the eyes; looking up shows the back of the blob, so no eyes.
 */
export function drawHero(draw: Draw, x: number, y: number, look: Look, dx: number, dy: number): void {
  draw.circle(x, y + 0.5, 5, C.panel); // shadow
  draw.push();
  draw.translate(x, y);
  draw.scale(look.scaleX, look.scaleY);
  roundRect(draw, -6, -11, 12, 11, 5, C.lilac);
  if (dy >= 0) eyes(draw, 2.4, 1.1, dx * 2, -5 + dy);
  draw.pop();
}

/**
 * The sword swing: a soft lime arc sweeping across the facing side. `t` runs 0 → 1 over the swing.
 * `reach` is how far the arc sits from the hero's centre.
 */
export function drawSwing(draw: Draw, x: number, y: number, dx: number, dy: number, t: number, reach: number): void {
  const facing = Math.atan2(dy, dx);
  const sweep = -1.1 + t * 2.2;
  for (let i = 0; i < 6; i++) {
    const a = facing + sweep - i * 0.22;
    const r = 2.6 - i * 0.35;
    if (r <= 0) break;
    draw.circle(x + Math.cos(a) * reach, y + Math.sin(a) * reach, r, i === 0 ? C.lime : "#cffb2d99");
  }
}

/** One enemy, a squish blob, drawn around its feet at (x, y). `hurt` brightens it. */
export function drawFoe(draw: Draw, kind: string, x: number, y: number, look: Look, time: number, hurt: boolean): void {
  const big = kind === "warden";
  const colour = hurt ? C.text : kind === "slime" || big ? C.sky : C.pink;
  const s = big ? 1.8 : 1;
  draw.circle(x, y + 0.5, 5 * s, C.panel); // shadow
  draw.push();
  draw.translate(x, y);
  draw.scale(look.scaleX * s, look.scaleY * s);
  if (kind === "moth") {
    // A floaty pink puff with flapping round wings.
    const flap = 0.6 + Math.abs(Math.sin(time * 14)) * 0.4;
    draw.circle(-5, -9, 3.5 * flap, C.lilac);
    draw.circle(5, -9, 3.5 * flap, C.lilac);
    draw.circle(0, -8, 4.5, colour);
    eyes(draw, 1.8, 0.9, 0, -8);
  } else if (kind === "thorn") {
    // A rooted pink bulb with four soft nubs.
    for (const [nx, ny] of [
      [-6, -6],
      [6, -6],
      [0, -12],
      [0, 0],
    ] as const)
      draw.circle(nx, ny, 2.2, colour);
    draw.circle(0, -6, 5.5, colour);
    eyes(draw, 2, 1, 0, -6);
  } else {
    // A slime: a dome with a flat-ish bottom.
    roundRect(draw, -6, -9, 12, 9, 4.5, colour);

    if (big) draw.circle(0, -10.5, 1.6, C.amber); // the warden's little crown
    eyes(draw, 2.2, 1, 0, -4);
  }
  draw.pop();
}

/** A rounded heart centred on (x, y), about 2r wide. */
export function heart(draw: Draw, x: number, y: number, r: number, colour: string): void {
  draw.circle(x - r * 0.5, y - r * 0.2, r * 0.55, colour);
  draw.circle(x + r * 0.5, y - r * 0.2, r * 0.55, colour);
  draw.push();
  draw.translate(x, y + r * 0.1);
  draw.rotate(Math.PI / 4);
  roundRect(draw, -r * 0.62, -r * 0.62, r * 1.24, r * 1.24, r * 0.25, colour);
  draw.pop();
}

/** A seed (mossfell's coins): an amber blob with a mint sprout. */
export function seed(draw: Draw, x: number, y: number): void {
  draw.circle(x + 1.5, y - 3, 1.5, C.mint);
  draw.circle(x, y, 3.5, C.amber);
  draw.circle(x - 1.2, y - 1.2, 1, C.text);
}

/** A key: a round amber bow and a rounded bit. */
export function key(draw: Draw, x: number, y: number): void {
  draw.circle(x - 3, y, 3, C.amber);
  draw.circle(x - 3, y, 1.1, C.ink);
  roundRect(draw, x - 1, y - 1, 7, 2.2, 1.1, C.amber);
  roundRect(draw, x + 3, y, 2, 3, 1, C.amber);
}

/** The mossheart relic: a big mint heart with a lime glow. */
export function relic(draw: Draw, x: number, y: number, time: number): void {
  draw.circle(x, y, 8 + Math.sin(time * 3), "#cffb2d33");
  heart(draw, x, y, 6, C.mint);
  draw.circle(x - 2.5, y - 2.5, 1.2, C.lime);
}
