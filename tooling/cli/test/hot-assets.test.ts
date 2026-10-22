import { describe, expect, it } from "vitest";
import { hotAssetFiles } from "../src/vite-plugin.js";

const manifest = {
  assets: {
    level1: { type: "json", src: "assets/level1.tmj" },
    "world/Level_0": { type: "json", src: "assets/world/Level_0.ldtkl" },
    notes: { type: "text", src: "assets/notes.txt" },
    hero: { type: "image", src: "assets/hero.png" },
  },
};

describe("hotAssetFiles", () => {
  it("re-fetches changed level and data files the manifest serves as-is", () => {
    expect(
      hotAssetFiles(
        [
          { event: "change", rel: "level1.tmj" },
          { event: "change", rel: "world/Level_0.ldtkl" },
          { event: "change", rel: "notes.txt" },
        ],
        manifest,
      ),
    ).toEqual(["assets/level1.tmj", "assets/world/Level_0.ldtkl", "assets/notes.txt"]);
  });

  it("reloads the page for images, added or removed files, and files the manifest doesn't serve", () => {
    expect(hotAssetFiles([{ event: "change", rel: "hero.png" }], manifest)).toBeNull();
    expect(hotAssetFiles([{ event: "add", rel: "level2.tmj" }], manifest)).toBeNull();
    expect(
      hotAssetFiles(
        [
          { event: "change", rel: "level1.tmj" },
          { event: "unlink", rel: "old.tmj" },
        ],
        manifest,
      ),
    ).toBeNull();
    // A data file no importer picked up (not in the manifest), or one an importer rewrote (served from elsewhere).
    expect(hotAssetFiles([{ event: "change", rel: "tiles.csv" }], manifest)).toBeNull();
    const rewritten = { assets: { level1: { type: "json", src: "assets/_gen/level1.json" } } };
    expect(hotAssetFiles([{ event: "change", rel: "level1.tmj" }], rewritten)).toBeNull();
  });
});
