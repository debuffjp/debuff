import { describe, expect, it } from "vitest";
import { hotAssetFiles } from "../src/vite-plugin.js";

describe("hotAssetFiles", () => {
  it("re-fetches changed level and data files in place", () => {
    expect(
      hotAssetFiles([
        { event: "change", rel: "level1.tmj" },
        { event: "change", rel: "world/Level_0.ldtkl" },
      ]),
    ).toEqual(["assets/level1.tmj", "assets/world/Level_0.ldtkl"]);
  });

  it("reloads the page for anything else", () => {
    expect(hotAssetFiles([{ event: "change", rel: "hero.png" }])).toBeNull();
    expect(hotAssetFiles([{ event: "add", rel: "level2.tmj" }])).toBeNull();
    expect(
      hotAssetFiles([
        { event: "change", rel: "level1.tmj" },
        { event: "unlink", rel: "old.tmj" },
      ]),
    ).toBeNull();
  });
});
