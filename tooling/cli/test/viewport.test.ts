import { describe, expect, it } from "vitest";
import { checkViewport } from "../src/config.js";

describe("checkViewport", () => {
  it("accepts [width, height] in whole CSS pixels", () => {
    expect(() => checkViewport([360, 640], "x")).not.toThrow();
    expect(() => checkViewport([960, 540], "x")).not.toThrow();
  });

  it("says what's wrong with anything else", () => {
    for (const bad of [[360], [360, 640, 1], [360.5, 640], [50, 640], [360, 5000], "360x640", { width: 360, height: 640 }])
      expect(() => checkViewport(bad, "scenarios/a.json: viewport")).toThrow(/scenarios\/a\.json: viewport must be \[width, height\]/);
  });
});
