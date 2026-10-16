import type { TextureSource } from "@debuffjp/core";
import { Collision, FLIP_H, FLIP_V, type ImageRegion, type MapObject, Tilemap, type Tileset } from "./tilemap.js";

// Minimal shapes of LDtk's JSON format (https://ldtk.io/json/).
interface LdtkTile {
  px: [number, number];
  src: [number, number];
  /** Bit 0: flip X, bit 1: flip Y. */
  f: number;
  t: number;
}
interface LdtkField {
  __identifier: string;
  __value: unknown;
}
interface LdtkLayerInstance {
  __identifier: string;
  __type: "IntGrid" | "Entities" | "Tiles" | "AutoLayer";
  __cWid: number;
  __cHei: number;
  __gridSize: number;
  __opacity: number;
  __pxTotalOffsetX: number;
  __pxTotalOffsetY: number;
  __tilesetDefUid: number | null;
  layerDefUid: number;
  visible: boolean;
  intGridCsv: number[];
  gridTiles: LdtkTile[];
  autoLayerTiles: LdtkTile[];
  entityInstances: {
    __identifier: string;
    iid: string;
    px: [number, number];
    __pivot: [number, number];
    width: number;
    height: number;
    fieldInstances: LdtkField[];
  }[];
}
export interface LdtkTilesetDef {
  uid: number;
  identifier: string;
  relPath: string | null;
  pxWid: number;
  pxHei: number;
  tileGridSize: number;
  spacing: number;
  padding: number;
  customData?: { tileId: number; data: string }[];
  enumTags?: { enumValueId: string; tileIds: number[] }[];
}
interface LdtkLevel {
  identifier: string;
  pxWid: number;
  pxHei: number;
  fieldInstances: LdtkField[];
  layerInstances: LdtkLayerInstance[] | null;
  externalRelPath?: string | null;
}
export interface LdtkProject {
  defs: {
    tilesets: LdtkTilesetDef[];
    layers: { uid: number; identifier: string; intGridValues?: { value: number; identifier: string | null }[] }[];
  };
  levels: LdtkLevel[];
}

export interface FromLdtkOptions {
  /** Level identifier (e.g. "Level_0"). Default: the first level. */
  level?: string;
  /** Resolve a tileset's relative image path to a loaded image. */
  image: (relPath: string, tileset: LdtkTilesetDef) => TextureSource | ImageRegion;
  /**
   * Collision from IntGrid layers. By default every non-zero IntGrid value is solid, except values whose
   * identifier is "oneWay", "one_way" or "platform", which are one-way. Override per value here.
   */
  intGrid?: Record<number, "solid" | "oneWay" | "none">;
}

const ONE_WAY_NAMES = new Set(["oneway", "one_way", "platform"]);

/** Build a `Tilemap` from one level of an LDtk project. */
export function fromLdtk(project: LdtkProject, options: FromLdtkOptions): Tilemap {
  const level = options.level ? project.levels.find((l) => l.identifier === options.level) : project.levels[0];
  if (!level) throw new Error(`LDtk level "${options.level}" not found. Levels: ${project.levels.map((l) => l.identifier).join(", ")}`);
  if (!level.layerInstances) {
    throw new Error(
      `LDtk level "${level.identifier}" is stored externally (${level.externalRelPath}). Disable "Save levels to separate files" or load that file`,
    );
  }
  const instances = level.layerInstances;
  const grid = instances.find((l) => l.__type !== "Entities")?.__gridSize ?? 16;
  const width = Math.ceil(level.pxWid / grid);
  const height = Math.ceil(level.pxHei / grid);

  // Give each LDtk tileset a contiguous id range, in definition order.
  let nextId = 1;
  const firstIds = new Map<number, number>();
  const tilesets: Tileset[] = [];
  for (const def of project.defs.tilesets) {
    if (!def.relPath) continue; // embedded atlases (e.g. LDtk icons) have no image
    const columns = Math.floor((def.pxWid - def.padding * 2 + def.spacing) / (def.tileGridSize + def.spacing));
    const rows = Math.floor((def.pxHei - def.padding * 2 + def.spacing) / (def.tileGridSize + def.spacing));
    const properties: Record<number, Record<string, unknown>> = {};
    for (const { tileId, data } of def.customData ?? []) properties[tileId] = { ...properties[tileId], data };
    for (const { enumValueId, tileIds } of def.enumTags ?? []) {
      for (const id of tileIds) properties[id] = { ...properties[id], [enumValueId]: true };
    }
    firstIds.set(def.uid, nextId);
    tilesets.push({
      firstId: nextId,
      image: options.image(def.relPath, def),
      tileWidth: def.tileGridSize,
      tileHeight: def.tileGridSize,
      columns,
      count: columns * rows,
      margin: def.padding,
      spacing: def.spacing,
      properties,
    });
    nextId += columns * rows;
  }

  const map = new Tilemap({ width, height, tileWidth: grid, tileHeight: grid, tilesets, layers: [] });
  map.properties = Object.fromEntries(level.fieldInstances.map((f) => [f.__identifier, f.__value]));

  // LDtk lists layers top-most first; draw order is bottom-most first.
  for (const inst of [...instances].reverse()) {
    const common = { visible: inst.visible, opacity: inst.__opacity, offsetX: inst.__pxTotalOffsetX, offsetY: inst.__pxTotalOffsetY };
    if (inst.__type === "Entities") {
      map.objectLayers.set(
        inst.__identifier,
        inst.entityInstances.map(
          (e, i): MapObject => ({
            id: i + 1,
            name: e.__identifier,
            type: e.__identifier,
            x: e.px[0] - e.__pivot[0] * e.width + inst.__pxTotalOffsetX,
            y: e.px[1] - e.__pivot[1] * e.height + inst.__pxTotalOffsetY,
            width: e.width,
            height: e.height,
            properties: { iid: e.iid, ...Object.fromEntries(e.fieldInstances.map((f) => [f.__identifier, f.__value])) },
          }),
        ),
      );
      continue;
    }
    if (inst.__type === "IntGrid") applyIntGrid(map, project, inst, grid, options);
    const tiles = inst.__type === "Tiles" ? inst.gridTiles : inst.autoLayerTiles;
    if (!tiles.length) continue;
    if (inst.__gridSize !== grid)
      throw new Error(`LDtk layer "${inst.__identifier}" uses a ${inst.__gridSize}px grid; all tile layers must use ${grid}px`);
    const firstId = inst.__tilesetDefUid === null ? undefined : firstIds.get(inst.__tilesetDefUid);
    if (firstId === undefined) continue;
    // Auto-layer rules can stack tiles in one cell; extra tiles go to overflow layers drawn above.
    const stacks: Uint32Array[] = [];
    for (const tile of tiles) {
      const index = Math.floor(tile.px[1] / grid) * width + Math.floor(tile.px[0] / grid);
      const id = (firstId + tile.t) | (tile.f & 1 ? FLIP_H : 0) | (tile.f & 2 ? FLIP_V : 0);
      let target = stacks.find((s) => s[index] === 0);
      if (!target) {
        target = new Uint32Array(width * height);
        stacks.push(target);
      }
      target[index] = id >>> 0;
    }
    stacks.forEach((data, i) => {
      map.addLayer(i === 0 ? inst.__identifier : `${inst.__identifier}#${i + 1}`, { data, ...common });
    });
  }
  return map;
}

function applyIntGrid(map: Tilemap, project: LdtkProject, inst: LdtkLayerInstance, grid: number, options: FromLdtkOptions): void {
  if (inst.__gridSize !== grid) throw new Error(`LDtk IntGrid "${inst.__identifier}" uses a ${inst.__gridSize}px grid; expected ${grid}px`);
  const def = project.defs.layers.find((l) => l.uid === inst.layerDefUid);
  const names = new Map((def?.intGridValues ?? []).map((v) => [v.value, (v.identifier ?? "").toLowerCase()]));
  inst.intGridCsv.forEach((value, i) => {
    if (value === 0) return;
    const rule = options.intGrid?.[value] ?? (ONE_WAY_NAMES.has(names.get(value) ?? "") ? "oneWay" : "solid");
    if (rule === "none") return;
    map.setCollision(i % inst.__cWid, Math.floor(i / inst.__cWid), rule === "oneWay" ? Collision.OneWay : Collision.Solid);
  });
}
