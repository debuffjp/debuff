import type { Draw, TextureSource } from "@debuff/core";
import { describe, expect, it } from "vitest";
import { Collision, FLIP_D, FLIP_H, FLIP_V, fromLdtk, fromTiled, type LdtkProject, type TiledMap, Tilemap } from "../src/index.js";

const image = { width: 64, height: 32 } as unknown as TextureSource;
const tileset = { firstId: 1, image, tileWidth: 16, tileHeight: 16, columns: 4, count: 8 };

/** Records sprite draws: frame source x/y and where the frame's corners land. */
function recordingDraw() {
  const sprites: { sx: number; sy: number; x: number; y: number; o: Record<string, unknown> }[] = [];
  const draw = {
    alpha: 1,
    sprite: (f: { x: number; y: number }, x: number, y: number, o: Record<string, unknown>) =>
      sprites.push({ sx: f.x, sy: f.y, x, y, o: { ...o } }),
  } as unknown as Draw;
  return { draw, sprites };
}

describe("Tilemap", () => {
  it("stores tiles per layer and reads them by cell or position", () => {
    const map = new Tilemap({ width: 4, height: 3, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: ["ground", "deco"] });
    map.set("ground", 1, 2, 5);
    expect(map.get("ground", 1, 2)).toBe(5);
    expect(map.tileAt("ground", 20, 40)).toBe(5);
    expect(map.get("ground", 9, 9)).toBe(0);
    expect(() => map.get("nope", 0, 0)).toThrow(/Layers: ground, deco/);
    expect(map.pixelWidth).toBe(64);
  });

  it("draws only tiles in the camera view, at tile centres, with source rects", () => {
    const map = new Tilemap({ width: 100, height: 100, tileWidth: 16, tileHeight: 16, tilesets: [tileset] });
    for (let r = 0; r < 100; r++) for (let c = 0; c < 100; c++) map.set("main", c, r, 6); // local 5 → col 1, row 1
    const { draw, sprites } = recordingDraw();
    map.draw(draw, { camera: { x: 160, y: 90, zoom: 1, width: 320, height: 180 } });
    // 320×180 view over 16px tiles: 21 columns × 12 rows (partial tiles at the edges included).
    expect(sprites.length).toBe(21 * 12);
    expect(sprites[0]).toMatchObject({ sx: 16, sy: 16, x: 8, y: 8 });
  });

  it("applies parallax and skips hidden or empty layers", () => {
    const map = new Tilemap({ width: 10, height: 10, tileWidth: 16, tileHeight: 16, tilesets: [tileset], layers: [] });
    const data = new Uint32Array(100);
    data[0] = 1;
    map.addLayer("far", { data, parallaxX: 0.5, parallaxY: 0.5 });
    map.addLayer("hidden", { data: data.slice(), visible: false });
    const { draw, sprites } = recordingDraw();
    map.draw(draw, { camera: { x: 100, y: 100, zoom: 1, width: 320, height: 180 } });
    expect(sprites).toHaveLength(1);
    expect(sprites[0]).toMatchObject({ x: 8 + 50, y: 8 + 50 });
  });

  it("maps Tiled flip flags to rotations and flips that match Tiled's transform", () => {
    // For each flag combination, transform the frame's top-right corner (+1, -1 around the centre)
    // the way draw.sprite does (rotate after flip) and compare with Tiled: transpose, then H, then V.
    const tiled = (h: boolean, v: boolean, d: boolean) => {
      let [x, y] = [1, -1];
      if (d) [x, y] = [y, x];
      if (h) x = -x;
      if (v) y = -y;
      return [x, y];
    };
    const ours = (o: { rotation: number; flipX: boolean; flipY: boolean }) => {
      let [x, y] = [o.flipX ? -1 : 1, o.flipY ? 1 : -1];
      const c = Math.round(Math.cos(o.rotation));
      const s = Math.round(Math.sin(o.rotation));
      [x, y] = [x * c - y * s, x * s + y * c];
      return [x, y];
    };
    const map = new Tilemap({ width: 8, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [tileset] });
    const combos = [0, FLIP_H, FLIP_V, FLIP_H | FLIP_V, FLIP_D, FLIP_D | FLIP_H, FLIP_D | FLIP_V, FLIP_D | FLIP_H | FLIP_V];
    for (const [i, flags] of combos.entries()) map.set("main", i, 0, (1 | flags) >>> 0);
    const { draw, sprites } = recordingDraw();
    map.draw(draw);
    combos.forEach((flags, i) => {
      const expected = tiled((flags & FLIP_H) !== 0, (flags & FLIP_V) !== 0, (flags & FLIP_D) !== 0);
      expect(ours(sprites[i]?.o as never)).toEqual(expected);
    });
  });
});

describe("atlased tilesets", () => {
  it("offsets tile source rects by the region from assets.frame()", () => {
    const map = new Tilemap({
      width: 1,
      height: 1,
      tileWidth: 16,
      tileHeight: 16,
      tilesets: [{ ...tileset, image: { image, x: 100, y: 40 } }],
    });
    map.set("main", 0, 0, 6);
    const { draw, sprites } = recordingDraw();
    map.draw(draw);
    expect(sprites[0]).toMatchObject({ sx: 116, sy: 56 });
  });
});

describe("collision", () => {
  /** 10×10 map of 16px tiles with a floor on row 9, a wall at column 6, and a one-way ledge at row 5. */
  const level = () => {
    const map = new Tilemap({ width: 10, height: 10, tileWidth: 16, tileHeight: 16 });
    for (let c = 0; c < 10; c++) map.setCollision(c, 9, Collision.Solid);
    for (let r = 0; r < 9; r++) map.setCollision(6, r, Collision.Solid);
    for (let c = 1; c < 4; c++) map.setCollision(c, 5, Collision.OneWay);
    return map;
  };

  it("lands on the floor and reports ground", () => {
    const map = level();
    const body = { x: 70, y: 100, w: 10, h: 12 };
    const hit = map.move(body, 0, 100);
    expect(hit.onGround).toBe(true);
    expect(body.y + body.h).toBe(144);
  });

  it("stops at walls without tunnelling at high speed", () => {
    const map = level();
    const body = { x: 10, y: 120, w: 10, h: 12 };
    const hit = map.move(body, 500, 0);
    expect(hit.hitRight).toBe(true);
    expect(body.x + body.w).toBe(96);
  });

  it("passes up through one-way platforms and lands on them from above", () => {
    const map = level();
    const body = { x: 20, y: 100, w: 10, h: 12 };
    expect(map.move(body, 0, -40).hitCeiling).toBe(false); // jumped through from below
    const land = map.move(body, 0, 40);
    expect(land.onGround).toBe(true);
    expect(body.y + body.h).toBe(80);
    expect(map.move(body, 0, 10, { dropThrough: true }).onGround).toBe(false);
  });

  it("treats the map sides as walls and leaves the bottom open by default", () => {
    const map = new Tilemap({ width: 4, height: 4, tileWidth: 16, tileHeight: 16 });
    const body = { x: 2, y: 2, w: 8, h: 8 };
    expect(map.move(body, -20, 0).hitLeft).toBe(true);
    expect(body.x).toBe(0);
    expect(map.move(body, 0, 500).onGround).toBe(false);
    map.edges.bottom = true;
    const b2 = { x: 2, y: 2, w: 8, h: 8 };
    expect(map.move(b2, 0, 500).onGround).toBe(true);
  });
});

describe("fromTiled", () => {
  const tiled: TiledMap = {
    width: 3,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    orientation: "orthogonal",
    properties: [{ name: "music", value: "theme" }],
    tilesets: [
      {
        firstgid: 1,
        image: "tiles.png",
        columns: 4,
        tilecount: 8,
        tilewidth: 16,
        tileheight: 16,
        tiles: [{ id: 2, properties: [{ name: "solid", value: true }] }],
      },
    ],
    layers: [
      { type: "tilelayer", name: "ground", width: 3, height: 2, data: [0, 0, 0, 3, 3, (2 | FLIP_H) >>> 0] },
      {
        type: "group",
        name: "decor",
        offsetx: 4,
        layers: [{ type: "tilelayer", name: "vines", width: 3, height: 2, opacity: 0.5, data: [1, 0, 0, 0, 0, 0] }],
      },
      {
        type: "objectgroup",
        name: "spawns",
        objects: [
          {
            id: 7,
            name: "player",
            class: "Spawn",
            x: 16,
            y: 32,
            width: 16,
            height: 16,
            gid: 5,
            properties: [{ name: "facing", value: "left" }],
          },
        ],
      },
    ],
  };

  it("imports layers, groups, flips, properties, objects and collision", () => {
    const map = fromTiled(tiled, { image: () => image });
    expect(map.layers.map((l) => l.name)).toEqual(["ground", "vines"]);
    expect(map.layer("vines")).toMatchObject({ offsetX: 4, opacity: 0.5 });
    expect(map.get("ground", 2, 1)).toBe((2 | FLIP_H) >>> 0);
    expect(map.properties).toEqual({ music: "theme" });
    expect(map.collisionAt(0, 1)).toBe(Collision.Solid); // tile 3 = local 2 has solid: true
    expect(map.collisionAt(2, 1)).toBe(Collision.None);
    expect(map.objects("spawns")[0]).toMatchObject({ name: "player", type: "Spawn", x: 16, y: 16, properties: { facing: "left", gid: 5 } });
  });

  it("decodes base64 data, infinite maps and external tilesets", () => {
    const bytes = new Uint8Array(new Uint32Array([1, 2, 0, 0]).buffer);
    const base64 = btoa(String.fromCharCode(...bytes));
    const map = fromTiled(
      {
        ...tiled,
        infinite: true,
        tilesets: [{ firstgid: 1, source: "tiles.tsj" }],
        layers: [{ type: "tilelayer", name: "a", encoding: "base64", chunks: [{ x: -2, y: 0, width: 2, height: 2, data: base64 }] }],
      },
      { image: () => image, tilesets: { "tiles.tsj": { image: "t.png", columns: 4, tilecount: 8 } } },
    );
    expect([map.width, map.height]).toEqual([2, 2]);
    expect(map.get("a", 1, 0)).toBe(2);
  });

  it("explains unsupported inputs", () => {
    expect(() => fromTiled({ ...tiled, orientation: "isometric" }, { image: () => image })).toThrow(/orthogonal/);
    expect(() => fromTiled({ ...tiled, tilesets: [{ firstgid: 1, source: "x.tsj" }] }, { image: () => image })).toThrow(/options.tilesets/);
  });
});

describe("fromLdtk", () => {
  const project: LdtkProject = {
    defs: {
      tilesets: [{ uid: 9, identifier: "World", relPath: "world.png", pxWid: 64, pxHei: 32, tileGridSize: 16, spacing: 0, padding: 0 }],
      layers: [
        {
          uid: 2,
          identifier: "Collisions",
          intGridValues: [
            { value: 1, identifier: "wall" },
            { value: 2, identifier: "platform" },
          ],
        },
      ],
    },
    levels: [
      {
        identifier: "Level_0",
        pxWid: 48,
        pxHei: 32,
        fieldInstances: [{ __identifier: "night", __value: true }],
        layerInstances: [
          {
            __identifier: "Entities",
            __type: "Entities",
            __cWid: 3,
            __cHei: 2,
            __gridSize: 16,
            __opacity: 1,
            __pxTotalOffsetX: 0,
            __pxTotalOffsetY: 0,
            __tilesetDefUid: null,
            layerDefUid: 3,
            visible: true,
            intGridCsv: [],
            gridTiles: [],
            autoLayerTiles: [],
            entityInstances: [
              { __identifier: "Player", iid: "abc", px: [24, 32], __pivot: [0.5, 1], width: 16, height: 16, fieldInstances: [] },
            ],
          },
          {
            __identifier: "Collisions",
            __type: "IntGrid",
            __cWid: 3,
            __cHei: 2,
            __gridSize: 16,
            __opacity: 1,
            __pxTotalOffsetX: 0,
            __pxTotalOffsetY: 0,
            __tilesetDefUid: 9,
            layerDefUid: 2,
            visible: true,
            intGridCsv: [0, 2, 0, 1, 1, 1],
            gridTiles: [],
            autoLayerTiles: [
              { px: [0, 16], src: [0, 0], f: 1, t: 0 },
              { px: [0, 16], src: [16, 0], f: 0, t: 1 },
            ],
            entityInstances: [],
          },
        ],
      },
    ],
  };

  it("imports tiles (with stacking), IntGrid collision, entities and level fields", () => {
    const map = fromLdtk(project, { image: () => image });
    expect([map.width, map.height, map.tileWidth]).toEqual([3, 2, 16]);
    expect(map.layers.map((l) => l.name)).toEqual(["Collisions", "Collisions#2"]);
    expect(map.get("Collisions", 0, 1)).toBe((1 | FLIP_H) >>> 0);
    expect(map.get("Collisions#2", 0, 1)).toBe(2);
    expect(map.collisionAt(1, 0)).toBe(Collision.OneWay);
    expect(map.collisionAt(0, 1)).toBe(Collision.Solid);
    expect(map.objects("Entities")[0]).toMatchObject({ name: "Player", x: 16, y: 16, properties: { iid: "abc" } });
    expect(map.properties).toEqual({ night: true });
  });

  it("supports collision overrides and explains missing levels", () => {
    const map = fromLdtk(project, { image: () => image, intGrid: { 2: "none" } });
    expect(map.collisionAt(1, 0)).toBe(Collision.None);
    expect(() => fromLdtk(project, { level: "Nope", image: () => image })).toThrow(/Levels: Level_0/);
  });
});
