import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "fast-png";
import { describe, expect, it } from "vitest";
import { buildAtlases, compileAssets, decodePng, packRects } from "../src/index.js";

/** A solid-colour PNG with a distinct top-left pixel, so placement and extrusion are checkable. */
function png(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  data.set([255, 255, 255, 255], 0);
  return encode({ width: w, height: h, data, channels: 4, depth: 8 });
}

function project(files: Record<string, Uint8Array | string>): string {
  const root = mkdtempSync(join(tmpdir(), "debuff-atlas-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("packRects", () => {
  it("packs without overlaps, inside bounds, opening new bins when full", () => {
    const sizes = Array.from({ length: 60 }, (_, i) => ({ w: 8 + ((i * 7) % 40), h: 8 + ((i * 11) % 40) }));
    const bins = packRects(sizes, 128, 0);
    expect(bins.length).toBeGreaterThan(1);
    const placed = bins.flatMap((b, bi) =>
      [...b.items].map(([i, p]) => ({ bi, ...p, w: sizes[i]?.w ?? 0, h: sizes[i]?.h ?? 0, bw: b.width, bh: b.height })),
    );
    expect(placed).toHaveLength(sizes.length);
    for (const a of placed) {
      expect(a.x + a.w).toBeLessThanOrEqual(a.bw);
      expect(a.y + a.h).toBeLessThanOrEqual(a.bh);
      for (const b of placed) {
        if (a === b || a.bi !== b.bi) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it("rejects images larger than the atlas", () => {
    expect(() => packRects([{ w: 300, h: 10 }], 256, 0)).toThrow(/can't fit a 256px atlas/);
  });
});

describe("buildAtlases", () => {
  it("copies pixels exactly and extrudes edges into the padding", () => {
    const [atlas] = buildAtlases(
      [
        { id: "red", png: png(4, 4, [255, 0, 0]) },
        { id: "blue", png: png(3, 5, [0, 0, 255]) },
      ],
      { padding: 2, extrude: 1 },
    );
    if (!atlas) throw new Error("no atlas");
    const img = decodePng(atlas.png);
    const at = (x: number, y: number) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
    const red = atlas.rects.get("red");
    if (!red) throw new Error("red not placed");
    expect(red).toMatchObject({ w: 4, h: 4 });
    expect(at(red.x, red.y)).toEqual([255, 255, 255, 255]); // distinct corner preserved
    expect(at(red.x + 1, red.y + 1)).toEqual([255, 0, 0, 255]);
    expect(at(red.x - 1, red.y + 2)).toEqual([255, 0, 0, 255]); // extruded left edge
    expect(at(red.x - 1, red.y - 1)).toEqual([255, 255, 255, 255]); // extruded corner
  });
});

describe("compileAssets atlas stage", () => {
  const files = () => ({
    "assets/hero@8x8.png": png(16, 8, [255, 0, 0]),
    "assets/coin.png": png(8, 8, [255, 200, 0]),
    "assets/bg.png": png(1500, 10, [0, 0, 0]),
    "assets/level2/boss.png": png(32, 32, [0, 255, 0]),
    "assets/photo.jpg": "not really a jpeg",
  });

  it("packs PNGs per group, keeps big and lone images standalone, and records rects", async () => {
    const root = project(files());
    const { manifest, outputs } = await compileAssets(root, { cache: false });
    expect([...outputs.keys()]).toEqual(["_atlas/default-0.png"]);
    expect(manifest.assets.hero).toMatchObject({ src: "assets/_atlas/default-0.png", grid: { frameWidth: 8, frameHeight: 8 } });
    expect(manifest.assets.hero?.rect).toMatchObject({ w: 16, h: 8 });
    expect(manifest.assets.coin?.src).toBe("assets/_atlas/default-0.png");
    expect(manifest.assets.bg).toMatchObject({ src: "assets/bg.png" }); // > maxSize / 2
    expect(manifest.assets["level2/boss"]).toMatchObject({ src: "assets/level2/boss.png" }); // alone in its group
    expect(manifest.assets.photo?.rect).toBeUndefined();
  });

  it("leaves invalid or corrupt PNGs standalone with a warning", async () => {
    const root = project({ "assets/a.png": png(8, 8, [1, 2, 3]), "assets/fake.png": "not a png", "assets/b.png": png(8, 8, [4, 5, 6]) });
    const { manifest, warnings } = await compileAssets(root, { cache: false });
    expect(manifest.assets.fake?.src).toBe("assets/fake.png");
    expect(manifest.assets.a?.src).toBe("assets/_atlas/default-0.png");
    expect(warnings).toContain("assets/fake.png: not a valid PNG, left out of atlases");
  });

  it("can be disabled or exclude ids, and caches results", async () => {
    const root = project(files());
    expect((await compileAssets(root, { atlas: false, cache: false })).outputs.size).toBe(0);
    const excluded = await compileAssets(root, { atlas: { exclude: ["coin"] }, cache: false });
    expect(excluded.outputs.size).toBe(0); // only hero left in the group, so no atlas
    const first = await compileAssets(root);
    const second = await compileAssets(root);
    expect(second.outputs.get("_atlas/default-0.png")).toEqual(first.outputs.get("_atlas/default-0.png"));
  });
});
