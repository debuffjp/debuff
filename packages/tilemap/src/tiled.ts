import type { TextureSource } from "@debuff/core";
import { type MapObject, Tilemap, type Tileset } from "./tilemap.js";

// Minimal shapes of Tiled's JSON format (https://doc.mapeditor.org/en/stable/reference/json-map-format/).
interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}
interface TiledChunk {
  x: number;
  y: number;
  width: number;
  height: number;
  data: number[] | string;
}
interface TiledLayer {
  type: "tilelayer" | "objectgroup" | "group" | "imagelayer";
  name: string;
  visible?: boolean;
  opacity?: number;
  offsetx?: number;
  offsety?: number;
  parallaxx?: number;
  parallaxy?: number;
  width?: number;
  height?: number;
  data?: number[] | string;
  chunks?: TiledChunk[];
  encoding?: "csv" | "base64";
  compression?: string;
  objects?: {
    id: number;
    name?: string;
    type?: string;
    class?: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    gid?: number;
    properties?: TiledProperty[];
  }[];
  layers?: TiledLayer[];
  properties?: TiledProperty[];
}
export interface TiledTileset {
  firstgid?: number;
  source?: string;
  name?: string;
  image?: string;
  columns?: number;
  tilecount?: number;
  tilewidth?: number;
  tileheight?: number;
  margin?: number;
  spacing?: number;
  tiles?: { id: number; properties?: TiledProperty[]; type?: string; class?: string }[];
}
export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite?: boolean;
  orientation?: string;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties?: TiledProperty[];
}

export interface FromTiledOptions {
  /** Resolve a tileset image path (as written in the map or tileset) to a loaded image. */
  image: (path: string, tileset: TiledTileset) => TextureSource;
  /** External tilesets (`.tsj`) by the `source` path the map references. */
  tilesets?: Record<string, TiledTileset>;
  /**
   * Collision. By default: tiles with a `solid`/`collides`/`oneWay` property in any layer, plus every
   * tile in layers whose `collision` property is true. Pass layer names to use those layers instead.
   */
  collisionLayers?: string[];
}

/** Build a `Tilemap` from a Tiled JSON map (`.tmj` / `.json`). Orthogonal maps only. */
export function fromTiled(map: TiledMap, options: FromTiledOptions): Tilemap {
  if (map.orientation && map.orientation !== "orthogonal") {
    throw new Error(`Tiled map orientation "${map.orientation}" isn't supported yet; use orthogonal`);
  }
  const tilesets = map.tilesets.map((ref): Tileset => {
    const external = ref.source ? options.tilesets?.[ref.source] : undefined;
    const ts: TiledTileset = external ? { ...external, ...(ref.firstgid === undefined ? {} : { firstgid: ref.firstgid }) } : ref;
    if (ref.source && !options.tilesets?.[ref.source]) {
      throw new Error(`External tileset "${ref.source}" not provided. Pass it in options.tilesets["${ref.source}"]`);
    }
    if (!ts.image) throw new Error(`Tileset "${ts.name ?? ref.source}" has no image. Image-collection tilesets aren't supported yet`);
    const properties: Record<number, Record<string, unknown>> = {};
    for (const tile of ts.tiles ?? []) {
      const props = toProps(tile.properties);
      const kind = tile.class ?? tile.type;
      if (kind) props.class = kind;
      properties[tile.id] = props;
    }
    return {
      firstId: ts.firstgid ?? 1,
      image: options.image(ts.image, ts),
      tileWidth: ts.tilewidth ?? map.tilewidth,
      tileHeight: ts.tileheight ?? map.tileheight,
      columns: ts.columns ?? 1,
      count: ts.tilecount ?? 0,
      margin: ts.margin ?? 0,
      spacing: ts.spacing ?? 0,
      properties,
    };
  });

  const flat = flatten(map.layers);
  // Infinite maps store chunks; find their bounds so the map becomes a finite grid.
  let minX = 0;
  let minY = 0;
  let width = map.width;
  let height = map.height;
  if (map.infinite) {
    const chunks = flat.flatMap((l) => l.layer.chunks ?? []);
    if (chunks.length) {
      minX = Math.min(...chunks.map((c) => c.x));
      minY = Math.min(...chunks.map((c) => c.y));
      width = Math.max(...chunks.map((c) => c.x + c.width)) - minX;
      height = Math.max(...chunks.map((c) => c.y + c.height)) - minY;
    }
  }

  const result = new Tilemap({ width, height, tileWidth: map.tilewidth, tileHeight: map.tileheight, tilesets, layers: [] });
  result.properties = toProps(map.properties);
  const shiftX = -minX * map.tilewidth;
  const shiftY = -minY * map.tileheight;
  const collisionByProperty: string[] = [];

  for (const { layer, offsetX, offsetY, opacity, parallaxX, parallaxY, visible } of flat) {
    if (layer.type === "tilelayer") {
      const data = new Uint32Array(width * height);
      const blit = (src: number[] | string, x0: number, y0: number, w: number, h: number) => {
        const cells = decode(src, layer);
        for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) data[(y0 + r) * width + (x0 + c)] = cells[r * w + c] ?? 0;
      };
      if (layer.chunks) for (const c of layer.chunks) blit(c.data, c.x - minX, c.y - minY, c.width, c.height);
      else if (layer.data) blit(layer.data, 0, 0, layer.width ?? width, layer.height ?? height);
      result.addLayer(layer.name, { data, visible, opacity, parallaxX, parallaxY, offsetX, offsetY });
      if (toProps(layer.properties).collision === true) collisionByProperty.push(layer.name);
    } else if (layer.type === "objectgroup") {
      result.objectLayers.set(
        layer.name,
        (layer.objects ?? []).map(
          (o): MapObject => ({
            id: o.id,
            name: o.name ?? "",
            type: o.class ?? o.type ?? "",
            x: o.x + offsetX + shiftX,
            // Tile objects are anchored bottom-left in Tiled; normalise everything to top-left.
            y: o.y + offsetY + shiftY - (o.gid ? (o.height ?? 0) : 0),
            width: o.width ?? 0,
            height: o.height ?? 0,
            properties: { ...toProps(o.properties), ...(o.gid ? { gid: o.gid } : {}) },
          }),
        ),
      );
    }
  }

  if (options.collisionLayers) result.collideFrom(options.collisionLayers);
  else {
    result.collideFrom(result.layers.map((l) => l.name));
    if (collisionByProperty.length) result.collideFrom(collisionByProperty, { everyTile: true });
  }
  return result;
}

interface FlatLayer {
  layer: TiledLayer;
  offsetX: number;
  offsetY: number;
  opacity: number;
  parallaxX: number;
  parallaxY: number;
  visible: boolean;
}

/** Flatten groups, combining offsets, opacity, parallax and visibility. */
function flatten(layers: TiledLayer[], parent?: Omit<FlatLayer, "layer">): FlatLayer[] {
  return layers.flatMap((layer) => {
    const own = {
      offsetX: (parent?.offsetX ?? 0) + (layer.offsetx ?? 0),
      offsetY: (parent?.offsetY ?? 0) + (layer.offsety ?? 0),
      opacity: (parent?.opacity ?? 1) * (layer.opacity ?? 1),
      parallaxX: (parent?.parallaxX ?? 1) * (layer.parallaxx ?? 1),
      parallaxY: (parent?.parallaxY ?? 1) * (layer.parallaxy ?? 1),
      visible: (parent?.visible ?? true) && (layer.visible ?? true),
    };
    return layer.type === "group" ? flatten(layer.layers ?? [], own) : [{ layer, ...own }];
  });
}

function decode(src: number[] | string, layer: TiledLayer): ArrayLike<number> {
  if (Array.isArray(src)) return src;
  if (layer.compression) {
    throw new Error(`Tile layer "${layer.name}" uses ${layer.compression} compression. Export with CSV or uncompressed Base64`);
  }
  const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const out = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint32(i * 4, true);
  return out;
}

function toProps(props?: TiledProperty[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of props ?? []) out[p.name] = p.value;
  return out;
}
