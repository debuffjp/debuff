import type { Draw, Frame, TextureSource } from "@debuff/core";
import { type Body, type MoveOptions, type MoveResult, move } from "./collide.js";

/** Tile flip/rotation flags stored in the top bits of a tile id (Tiled's convention). */
export const FLIP_H = 0x80000000;
export const FLIP_V = 0x40000000;
export const FLIP_D = 0x20000000;
const ID_MASK = 0x1fffffff;

/** Collision kinds in the collision grid. `OneWay` is solid only from above (jump-through platforms). */
export const Collision = { None: 0, Solid: 1, OneWay: 2 } as const;
export type Collision = (typeof Collision)[keyof typeof Collision];

/** An image region, e.g. from `assets.frame(id)` when the tileset image was packed into an atlas. */
export interface ImageRegion {
  image: TextureSource;
  x: number;
  y: number;
}

export interface Tileset {
  /** First tile id (gid) this tileset covers. Tile id 0 always means "empty". */
  firstId: number;
  /** The tileset image, or a region of an atlas holding it. */
  image: TextureSource | ImageRegion;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  count: number;
  margin?: number;
  spacing?: number;
  /** Per local tile index: custom properties (e.g. `solid`, `oneWay`). */
  properties?: Record<number, Record<string, unknown>>;
}

export interface TileLayer {
  name: string;
  /** Tile ids row-major, width × height; 0 = empty. High bits carry FLIP_* flags. */
  data: Uint32Array;
  visible: boolean;
  opacity: number;
  /** Scroll factor relative to the camera; 1 = world space, 0 = fixed to the screen. */
  parallaxX: number;
  parallaxY: number;
  offsetX: number;
  offsetY: number;
}

export interface MapObject {
  id: number;
  name: string;
  /** Tiled class/type or LDtk entity identifier. */
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, unknown>;
}

export interface TilemapOptions {
  /** Size in tiles. */
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesets?: Tileset[];
  /** Layer names to create empty, in draw order. Default ["main"]. */
  layers?: string[];
}

export interface TileLayerDrawOptions {
  /** Draw only these layers, by name. Default: every visible layer. */
  layers?: readonly string[];
  /** Cull to this camera's view and apply layer parallax. Draw inside `draw.withCamera(camera, ...)`. */
  camera?: { x: number; y: number; zoom: number; width: number; height: number };
}

/**
 * A grid of tile layers, tilesets, object layers and a collision grid. Build one in code, or import
 * with `fromTiled` / `fromLDtk`. Positions are in pixels (world units); tile coordinates are columns/rows.
 */
export class Tilemap {
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tilesets: Tileset[];
  readonly layers: TileLayer[] = [];
  readonly objectLayers = new Map<string, MapObject[]>();
  /** One `Collision` value per cell. */
  readonly collision: Uint8Array;
  /** Map-level custom properties. */
  properties: Record<string, unknown> = {};
  /** Which map edges block movement. Default: solid sides, open top and bottom (so bodies can fall into pits). */
  edges = { left: true, right: true, top: false, bottom: false };

  /** Frame per tile id (without flags), built lazily. */
  private readonly frames: (Frame | undefined)[] = [];
  /** Reused per tile so drawing doesn't allocate. */
  private readonly spriteOptions = {
    origin: [0.5, 0.5] as [number, number],
    flipX: false,
    flipY: false,
    rotation: 0,
    alpha: 1,
  };

  constructor(options: TilemapOptions) {
    this.width = options.width;
    this.height = options.height;
    this.tileWidth = options.tileWidth;
    this.tileHeight = options.tileHeight;
    this.tilesets = [...(options.tilesets ?? [])].sort((a, b) => a.firstId - b.firstId);
    this.collision = new Uint8Array(this.width * this.height);
    for (const name of options.layers ?? ["main"]) this.addLayer(name);
  }

  /** Width and height in pixels. */
  get pixelWidth(): number {
    return this.width * this.tileWidth;
  }

  get pixelHeight(): number {
    return this.height * this.tileHeight;
  }

  addLayer(name: string, init: Partial<Omit<TileLayer, "name">> = {}): TileLayer {
    if (this.layer(name)) throw new Error(`Tile layer "${name}" already exists`);
    const layer: TileLayer = {
      name,
      data: init.data ?? new Uint32Array(this.width * this.height),
      visible: init.visible ?? true,
      opacity: init.opacity ?? 1,
      parallaxX: init.parallaxX ?? 1,
      parallaxY: init.parallaxY ?? 1,
      offsetX: init.offsetX ?? 0,
      offsetY: init.offsetY ?? 0,
    };
    if (layer.data.length !== this.width * this.height) {
      throw new Error(`Tile layer "${name}" has ${layer.data.length} cells; expected ${this.width * this.height}`);
    }
    this.layers.push(layer);
    return layer;
  }

  layer(name: string): TileLayer | undefined {
    return this.layers.find((l) => l.name === name);
  }

  /** Objects in an object layer (spawn points, triggers, entities). */
  objects(layer: string): MapObject[] {
    return this.objectLayers.get(layer) ?? [];
  }

  // ---- cells -------------------------------------------------------------------------------------

  inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.width && row < this.height;
  }

  /** Tile id (with flags) at a cell, 0 if empty or out of bounds. */
  get(layer: string, col: number, row: number): number {
    if (!this.inBounds(col, row)) return 0;
    return this.requireLayer(layer).data[row * this.width + col] ?? 0;
  }

  set(layer: string, col: number, row: number, id: number): void {
    if (!this.inBounds(col, row)) return;
    this.requireLayer(layer).data[row * this.width + col] = id >>> 0;
  }

  /** Tile id at a world position. */
  tileAt(layer: string, x: number, y: number): number {
    return this.get(layer, Math.floor(x / this.tileWidth), Math.floor(y / this.tileHeight));
  }

  /** Custom properties of a tile id, from its tileset. */
  tileProperties(id: number): Record<string, unknown> | undefined {
    const gid = id & ID_MASK;
    const ts = this.tilesetFor(gid);
    return ts?.properties?.[gid - ts.firstId];
  }

  // ---- collision ---------------------------------------------------------------------------------

  collisionAt(col: number, row: number): Collision {
    if (col < 0) return this.edges.left ? Collision.Solid : Collision.None;
    if (col >= this.width) return this.edges.right ? Collision.Solid : Collision.None;
    if (row < 0) return this.edges.top ? Collision.Solid : Collision.None;
    if (row >= this.height) return this.edges.bottom ? Collision.Solid : Collision.None;
    return (this.collision[row * this.width + col] ?? 0) as Collision;
  }

  setCollision(col: number, row: number, kind: Collision): void {
    if (this.inBounds(col, row)) this.collision[row * this.width + col] = kind;
  }

  /**
   * Fill the collision grid from tile data: cells in `layers` whose tile has a truthy `solid` / `oneWay`
   * property (or every non-empty cell, with `everyTile`) become solid / one-way.
   */
  collideFrom(layers: readonly string[], options: { everyTile?: boolean } = {}): this {
    for (const name of layers) {
      const { data } = this.requireLayer(name);
      for (let i = 0; i < data.length; i++) {
        const id = data[i] ?? 0;
        if ((id & ID_MASK) === 0) continue;
        const props = this.tileProperties(id);
        if (props?.oneWay) this.collision[i] = Collision.OneWay;
        else if (options.everyTile || props?.solid || props?.collides) this.collision[i] = Collision.Solid;
      }
    }
    return this;
  }

  /** Move a body through the map with tile collision. See {@link move}. */
  move(body: Body, dx: number, dy: number, options?: MoveOptions): MoveResult {
    return move(this, body, dx, dy, options);
  }

  // ---- rendering ---------------------------------------------------------------------------------

  /**
   * Draw tile layers. With a camera, only tiles in view are drawn and parallax is applied; call it
   * inside `draw.withCamera(camera, ...)`. Allocation-free per tile.
   */
  draw(draw: Draw, options: TileLayerDrawOptions = {}): void {
    const { tileWidth: tw, tileHeight: th } = this;
    const cam = options.camera;
    const o = this.spriteOptions;
    const baseAlpha = draw.alpha;
    for (const layer of this.layers) {
      if (options.layers ? !options.layers.includes(layer.name) : !layer.visible) continue;
      // Parallax: shift the layer by the part of the camera motion it should not follow.
      const px = cam ? cam.x * (1 - layer.parallaxX) : 0;
      const py = cam ? cam.y * (1 - layer.parallaxY) : 0;
      const ox = layer.offsetX + px;
      const oy = layer.offsetY + py;
      let c0 = 0;
      let r0 = 0;
      let c1 = this.width - 1;
      let r1 = this.height - 1;
      if (cam) {
        const hw = cam.width / 2 / cam.zoom;
        const hh = cam.height / 2 / cam.zoom;
        c0 = Math.max(0, Math.floor((cam.x - hw - ox) / tw));
        r0 = Math.max(0, Math.floor((cam.y - hh - oy) / th));
        c1 = Math.min(this.width - 1, Math.floor((cam.x + hw - ox) / tw));
        r1 = Math.min(this.height - 1, Math.floor((cam.y + hh - oy) / th));
      }
      draw.alpha = baseAlpha * layer.opacity;
      const { data } = layer;
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const raw = data[row * this.width + col] ?? 0;
          const gid = raw & ID_MASK;
          if (gid === 0) continue;
          const frame = this.frame(gid);
          if (!frame) continue;
          applyFlips(o, raw);
          draw.sprite(frame, col * tw + tw / 2 + ox, row * th + th / 2 + oy, o);
        }
      }
    }
    draw.alpha = baseAlpha;
  }

  // ---- internals ---------------------------------------------------------------------------------

  private requireLayer(name: string): TileLayer {
    const layer = this.layer(name);
    if (!layer) throw new Error(`Unknown tile layer "${name}". Layers: ${this.layers.map((l) => l.name).join(", ") || "none"}`);
    return layer;
  }

  private tilesetFor(gid: number): Tileset | undefined {
    let found: Tileset | undefined;
    for (const ts of this.tilesets) {
      if (ts.firstId <= gid) found = ts;
      else break;
    }
    return found && gid - found.firstId < found.count ? found : undefined;
  }

  private frame(gid: number): Frame | undefined {
    let f = this.frames[gid];
    if (f) return f;
    const ts = this.tilesetFor(gid);
    if (!ts) return undefined;
    const local = gid - ts.firstId;
    const margin = ts.margin ?? 0;
    const spacing = ts.spacing ?? 0;
    const col = local % ts.columns;
    const row = Math.floor(local / ts.columns);
    const region = "image" in ts.image ? ts.image : { image: ts.image, x: 0, y: 0 };
    f = {
      image: region.image,
      x: region.x + margin + col * (ts.tileWidth + spacing),
      y: region.y + margin + row * (ts.tileHeight + spacing),
      w: ts.tileWidth,
      h: ts.tileHeight,
    };
    this.frames[gid] = f;
    return f;
  }
}

/**
 * Tiled flip flags → sprite rotation/flips. Tiled applies the diagonal flip (transpose) first, then
 * horizontal, then vertical; expressed as rotate-then-flip that gives this table.
 */
function applyFlips(o: { flipX: boolean; flipY: boolean; rotation: number }, raw: number): void {
  const h = (raw & FLIP_H) !== 0;
  const v = (raw & FLIP_V) !== 0;
  if ((raw & FLIP_D) === 0) {
    o.rotation = 0;
    o.flipX = h;
    o.flipY = v;
    return;
  }
  // Diagonal: transpose = rotate 90° then flip Y; combine with H/V.
  if (h && v) {
    o.rotation = Math.PI / 2;
    o.flipX = true;
    o.flipY = false;
  } else if (h) {
    o.rotation = Math.PI / 2;
    o.flipX = false;
    o.flipY = false;
  } else if (v) {
    o.rotation = -Math.PI / 2;
    o.flipX = false;
    o.flipY = false;
  } else {
    o.rotation = Math.PI / 2;
    o.flipX = false;
    o.flipY = true;
  }
}
