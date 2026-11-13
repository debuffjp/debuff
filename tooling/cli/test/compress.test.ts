import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encode } from "fast-png";
import { parseKtx2 } from "spryte";
import { describe, expect, it } from "vitest";
import { compileAssets } from "../src/index.js";

function png(w: number, h: number, rgba: [number, number, number, number]): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return encode({ width: w, height: h, data, channels: 4, depth: 8 });
}

function project(files: Record<string, Uint8Array>): string {
  const root = mkdtempSync(join(tmpdir(), "debuff-ktx2-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe("compressed textures", () => {
  it("are off unless asked for", async () => {
    const { manifest } = await compileAssets(project({ "assets/bg.png": png(8, 8, [0, 0, 255, 255]) }), { cache: false });
    expect(manifest.assets.bg?.compressed).toBeUndefined();
  });

  it("writes a KTX2 file per format for each image, with mips and premultiplied alpha", async () => {
    const root = project({ "assets/bg.png": png(64, 32, [255, 0, 0, 128]) });
    const { manifest, outputs, warnings } = await compileAssets(root, { cache: false, compress: {} });
    expect(warnings).toEqual([]);
    const variants = manifest.assets.bg?.compressed ?? {};
    expect(Object.keys(variants).sort()).toEqual(["astc4x4", "bc7", "etc2"]);
    for (const [format, src] of Object.entries(variants)) {
      const file = outputs.get(src.replace(/^assets\//, ""));
      expect(file, src).toBeDefined();
      const t = parseKtx2(new Uint8Array(file as Buffer));
      expect([t.format, t.width, t.height, t.premultiplied, t.levels.length]).toEqual([format, 64, 32, true, 7]);
    }
  });

  it("compresses an atlas once and points every packed entry at it", async () => {
    const root = project({ "assets/a.png": png(8, 8, [255, 0, 0, 255]), "assets/b.png": png(8, 8, [0, 255, 0, 255]) });
    const { manifest } = await compileAssets(root, { cache: false, compress: { formats: ["bc7"] } });
    const a = manifest.assets.a;
    expect(a?.rect).toBeDefined();
    expect(a?.compressed).toEqual({ bc7: `assets/_ktx2/${a?.src.slice("assets/".length)}.bc7.ktx2` });
    expect(manifest.assets.b?.compressed).toEqual(a?.compressed);
  });

  it("skips ids it's told to exclude", async () => {
    const root = project({ "assets/ui/logo.png": png(8, 8, [0, 0, 0, 255]), "assets/bg.png": png(8, 8, [0, 0, 0, 255]) });
    const { manifest } = await compileAssets(root, { cache: false, atlas: false, compress: { exclude: ["ui/"] } });
    expect(manifest.assets["ui/logo"]?.compressed).toBeUndefined();
    expect(manifest.assets.bg?.compressed).toBeDefined();
  });
});
