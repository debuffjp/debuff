import { convertIndexedToRgb, decode, encode } from "fast-png";

export interface AtlasOptions {
  /** Largest atlas side in pixels. Default 2048 (safe on every WebGL2 device). */
  maxSize?: number;
  /** Transparent gap between sprites, in pixels. Default 2. */
  padding?: number;
  /** Edge pixels copied outward into the padding so filtering never samples a neighbour. Default 1. */
  extrude?: number;
  /** Asset ids (or id prefixes ending in "/") to leave out of atlases. */
  exclude?: string[];
}

export interface Placement {
  x: number;
  y: number;
}

export interface PackedBin {
  width: number;
  height: number;
  /** Placement per input index, in this bin. */
  items: Map<number, Placement>;
}

interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * MaxRects bin packing (best-short-side-fit). Inputs are sorted largest-first; anything that doesn't
 * fit opens a new bin. Bins are cropped to their used area (rounded up to a multiple of 4).
 * Throws if a single item can't fit in an empty bin.
 */
export function packRects(sizes: readonly { w: number; h: number }[], maxSize: number, gap: number): PackedBin[] {
  const order = sizes
    .map((_, i) => i)
    .sort((a, b) => Math.max(sizes[b]?.w ?? 0, sizes[b]?.h ?? 0) - Math.max(sizes[a]?.w ?? 0, sizes[a]?.h ?? 0));
  const bins: { free: Free[]; items: Map<number, Placement>; usedW: number; usedH: number }[] = [];
  for (const index of order) {
    const size = sizes[index];
    if (!size) continue;
    const w = size.w + gap;
    const h = size.h + gap;
    if (w > maxSize || h > maxSize) throw new Error(`An image of ${size.w}×${size.h} can't fit a ${maxSize}px atlas`);
    let placed = false;
    for (const bin of bins) {
      const spot = findSpot(bin.free, w, h);
      if (!spot) continue;
      place(bin, index, spot, w, h);
      placed = true;
      break;
    }
    if (!placed) {
      const bin = { free: [{ x: 0, y: 0, w: maxSize, h: maxSize }], items: new Map<number, Placement>(), usedW: 0, usedH: 0 };
      const spot = findSpot(bin.free, w, h);
      if (!spot) throw new Error("unreachable: empty bin rejected an item that fits");
      place(bin, index, spot, w, h);
      bins.push(bin);
    }
  }
  const up4 = (n: number) => Math.ceil(n / 4) * 4;
  return bins.map((b) => ({ width: Math.min(maxSize, up4(b.usedW)), height: Math.min(maxSize, up4(b.usedH)), items: b.items }));
}

function findSpot(free: Free[], w: number, h: number): Free | undefined {
  let best: Free | undefined;
  let bestShort = Number.POSITIVE_INFINITY;
  let bestLong = Number.POSITIVE_INFINITY;
  for (const f of free) {
    if (w > f.w || h > f.h) continue;
    const short = Math.min(f.w - w, f.h - h);
    const long = Math.max(f.w - w, f.h - h);
    if (short < bestShort || (short === bestShort && long < bestLong)) {
      best = f;
      bestShort = short;
      bestLong = long;
    }
  }
  return best;
}

function place(
  bin: { free: Free[]; items: Map<number, Placement>; usedW: number; usedH: number },
  index: number,
  spot: Free,
  w: number,
  h: number,
): void {
  const used = { x: spot.x, y: spot.y, w, h };
  bin.items.set(index, { x: spot.x, y: spot.y });
  bin.usedW = Math.max(bin.usedW, spot.x + w);
  bin.usedH = Math.max(bin.usedH, spot.y + h);
  // Split every free rect the placement overlaps, then drop rects contained in others.
  const next: Free[] = [];
  for (const f of bin.free) {
    if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) {
      next.push(f);
      continue;
    }
    if (used.x > f.x) next.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w) next.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
    if (used.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h) next.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
  }
  bin.free = next.filter((a, i) => !next.some((b, j) => i !== j && contains(b, a) && (!contains(a, b) || j < i)));
}

const contains = (outer: Free, inner: Free) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export interface Rgba {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel. */
  data: Uint8Array;
}

/** Decode any PNG (palette, grey, RGB, 16-bit…) to 8-bit RGBA. */
export function decodePng(bytes: Uint8Array): Rgba {
  const png = decode(bytes);
  const { width, height } = png;
  const out = new Uint8Array(width * height * 4);
  if (png.palette) {
    const rgb = convertIndexedToRgb(png);
    const ch = png.palette[0]?.length ?? 3;
    for (let i = 0; i < width * height; i++) {
      out[i * 4] = rgb[i * ch] ?? 0;
      out[i * 4 + 1] = rgb[i * ch + 1] ?? 0;
      out[i * 4 + 2] = rgb[i * ch + 2] ?? 0;
      out[i * 4 + 3] = ch === 4 ? (rgb[i * ch + 3] ?? 255) : 255;
    }
    return { width, height, data: out };
  }
  const ch = png.channels;
  const shift = png.depth === 16 ? 8 : 0;
  const src = png.data;
  for (let i = 0; i < width * height; i++) {
    const v = (k: number) => (src[i * ch + k] ?? 0) >> shift;
    if (ch === 1 || ch === 2) {
      const g = v(0);
      out.set([g, g, g, ch === 2 ? v(1) : 255], i * 4);
    } else {
      out.set([v(0), v(1), v(2), ch === 4 ? v(3) : 255], i * 4);
    }
  }
  return { width, height, data: out };
}

/** Copy `img` into `atlas` at (x, y), extruding its edge pixels `extrude` px outward. */
export function blit(atlas: Rgba, img: Rgba, x: number, y: number, extrude: number): void {
  const aw = atlas.width;
  for (let dy = -extrude; dy < img.height + extrude; dy++) {
    const ty = y + dy;
    if (ty < 0 || ty >= atlas.height) continue;
    const sy = Math.min(img.height - 1, Math.max(0, dy));
    for (let dx = -extrude; dx < img.width + extrude; dx++) {
      const tx = x + dx;
      if (tx < 0 || tx >= aw) continue;
      const sx = Math.min(img.width - 1, Math.max(0, dx));
      const s = (sy * img.width + sx) * 4;
      const t = (ty * aw + tx) * 4;
      atlas.data[t] = img.data[s] ?? 0;
      atlas.data[t + 1] = img.data[s + 1] ?? 0;
      atlas.data[t + 2] = img.data[s + 2] ?? 0;
      atlas.data[t + 3] = img.data[s + 3] ?? 0;
    }
  }
}

export interface AtlasInput {
  id: string;
  png: Uint8Array;
}

export interface BuiltAtlas {
  png: Uint8Array;
  width: number;
  height: number;
  /** Source rectangle per input id. */
  rects: Map<string, { x: number; y: number; w: number; h: number }>;
}

/** Pack PNGs into as few atlases as fit `maxSize`. */
export function buildAtlases(inputs: readonly AtlasInput[], options: AtlasOptions = {}): BuiltAtlas[] {
  const maxSize = options.maxSize ?? 2048;
  const padding = options.padding ?? 2;
  const extrude = Math.min(options.extrude ?? 1, Math.floor(padding / 2));
  const images = inputs.map((i) => decodePng(i.png));
  // Reserve padding on every side: items are offset by `padding` so extrusion has room at the edges.
  const bins = packRects(
    images.map((img) => ({ w: img.width + padding, h: img.height + padding })),
    maxSize,
    0,
  );
  return bins.map((bin) => {
    const atlas: Rgba = { width: bin.width, height: bin.height, data: new Uint8Array(bin.width * bin.height * 4) };
    const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const [index, at] of bin.items) {
      const img = images[index];
      const input = inputs[index];
      if (!img || !input) continue;
      const x = at.x + Math.ceil(padding / 2);
      const y = at.y + Math.ceil(padding / 2);
      blit(atlas, img, x, y, extrude);
      rects.set(input.id, { x, y, w: img.width, h: img.height });
    }
    return {
      png: encode({ width: atlas.width, height: atlas.height, data: atlas.data, channels: 4, depth: 8 }),
      width: atlas.width,
      height: atlas.height,
      rects,
    };
  });
}
