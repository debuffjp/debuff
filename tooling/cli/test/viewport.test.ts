import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkViewport, loadConfig } from "../src/config.js";

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

describe("loadConfig", () => {
  it("reads scenarios.viewport and leaves NODE_ENV as it was", async () => {
    // Loading a config through Vite used to set NODE_ENV=development, so `debuff build` shipped dev tools.
    const root = mkdtempSync(join(tmpdir(), "debuff-config-"));
    writeFileSync(join(root, "debuff.config.mjs"), "export default { scenarios: { viewport: [360, 640] } };\n");
    // Like a real `debuff build`, start with NODE_ENV unset (vitest sets it to "test", which Vite leaves alone).
    const saved = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      const config = await loadConfig(root);
      expect(config.viewport).toEqual([360, 640]);
      expect(process.env.NODE_ENV).toBeUndefined();
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});
