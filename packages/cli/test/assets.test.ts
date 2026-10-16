import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, compileAssets, findUnused } from "../src/index.js";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "debuff-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("compileAssets", () => {
  it("derives ids, groups and grids, and never touches sources", () => {
    const root = project({
      "public/assets/hero@16x24.png": "png-bytes",
      "public/assets/level1/map.json": "{}",
      "public/assets/notes.psd": "x",
      "src/main.ts": `assets.image("hero")`,
    });
    const { manifest, warnings } = compileAssets(root);
    expect(manifest.assets.hero).toMatchObject({ type: "image", src: "assets/hero@16x24.png", grid: { frameWidth: 16, frameHeight: 24 } });
    expect(manifest.assets["level1/map"]).toMatchObject({ type: "json", group: "level1" });
    expect(warnings[0]).toMatch(/notes\.psd/);
    expect(readFileSync(join(root, "public/assets/hero@16x24.png"), "utf8")).toBe("png-bytes");
    expect(findUnused(root, manifest)).toEqual(["level1/map"]);
  });

  it("is reproducible", () => {
    const root = project({ "public/assets/a.txt": "a", "public/assets/b.txt": "b" });
    const first = readFileSync(compileAssets(root).path, "utf8");
    expect(readFileSync(compileAssets(root).path, "utf8")).toBe(first);
  });
});

describe("buildReport", () => {
  it("totals by kind and flags dev leaks", () => {
    const root = project({ "dist/index.html": "<html>", "dist/a.js": "window.__DEBUFF_DEV__ = 1", "dist/x.png": "img" });
    const r = buildReport(join(root, "dist"));
    expect(r.totals.code.bytes).toBeGreaterThan(0);
    expect(r.largestAsset?.path).toBe("x.png");
    expect(r.leaks).toEqual([{ path: "a.js", token: "__DEBUFF_DEV__" }]);
  });
});
