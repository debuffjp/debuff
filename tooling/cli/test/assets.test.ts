import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, compileAssets, findUnused, type ToolingPlugin, validatePlugins } from "../src/index.js";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "debuff-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("compileAssets (built-in importer)", () => {
  it("derives ids, groups and grids in memory without touching the source tree", async () => {
    const root = project({
      "assets/hero@16x24.png": "png-bytes",
      "assets/level1/map.json": "{}",
      "assets/notes.psd": "x",
      "assets/.hidden/skip.png": "x",
      "src/main.ts": `assets.image("hero")`,
    });
    const { manifest, warnings, importedBy } = await compileAssets(root);
    expect(manifest.assets.hero).toMatchObject({ type: "image", src: "assets/hero@16x24.png", grid: { frameWidth: 16, frameHeight: 24 } });
    expect(manifest.assets["level1/map"]).toMatchObject({ type: "json", group: "level1", bytes: 2 });
    expect(Object.keys(manifest.assets)).toEqual(["hero", "level1/map"]);
    expect(warnings).toEqual([
      "Skipped notes.psd: no importer for this file type",
      // The fixture PNG is fake bytes, which the atlas stage reports instead of crashing on.
      "assets/hero@16x24.png: not a valid PNG, left out of atlases",
    ]);
    expect(importedBy.hero).toBe("debuff:builtin");
    expect(existsSync(join(root, "assets", "manifest.json"))).toBe(false);
    expect(readFileSync(join(root, "assets/hero@16x24.png"), "utf8")).toBe("png-bytes");
    expect(findUnused(root, manifest)).toEqual(["level1/map"]);
  });

  it("is deterministic", async () => {
    const root = project({ "assets/b.txt": "b", "assets/a.txt": "a" });
    expect(JSON.stringify((await compileAssets(root)).manifest)).toBe(JSON.stringify((await compileAssets(root)).manifest));
  });
});

describe("compileAssets (plugin importers)", () => {
  const sheetPlugin: ToolingPlugin = {
    name: "test-sheet",
    apiVersion: 1,
    assets: [
      {
        name: "test-sheet",
        extensions: [".sheet.json"],
        import: (file) => ({
          assets: { [file.id]: { type: "sheet", src: `assets/${file.id}.png`, frames: [{ x: 0, y: 0, w: 8, h: 8 }] } },
          consumes: [`${file.id}.png`],
          outputs: [{ path: "generated.txt", contents: "aGk=", encoding: "base64" }],
        }),
      },
    ],
  };

  it("lets plugins claim longer suffixes, consume siblings and generate files", async () => {
    const root = project({ "assets/hero.sheet.json": "{}", "assets/hero.png": "png" });
    const { manifest, outputs, importedBy } = await compileAssets(root, { plugins: [sheetPlugin], cache: false });
    expect(manifest.assets.hero).toMatchObject({ type: "sheet", src: "assets/hero.png", bytes: 3 });
    expect(importedBy.hero).toBe("test-sheet");
    expect(Object.keys(manifest.assets)).toEqual(["hero"]);
    expect(outputs.get("generated.txt")?.toString()).toBe("hi");
  });

  it("caches plugin results by content hash", async () => {
    const root = project({ "assets/hero.sheet.json": "{}", "assets/hero.png": "png" });
    let calls = 0;
    const counting: ToolingPlugin = {
      name: "counting",
      apiVersion: 1,
      assets: [
        {
          name: "counting",
          extensions: [".sheet.json"],
          import: (file) => {
            calls++;
            return { assets: { [file.id]: { type: "json", src: `assets/${file.rel}` } } };
          },
        },
      ],
    };
    await compileAssets(root, { plugins: [counting] });
    await compileAssets(root, { plugins: [counting] });
    expect(calls).toBe(1);
    writeFileSync(join(root, "assets/hero.sheet.json"), '{"changed":true}');
    await compileAssets(root, { plugins: [counting] });
    expect(calls).toBe(2);
  });

  it("runs command importers over stdin/stdout in any language", async () => {
    const root = project({
      "assets/level.map": "tiles",
      "importer.mjs": `
        let input = "";
        process.stdin.on("data", (d) => (input += d));
        process.stdin.on("end", () => {
          const file = JSON.parse(input);
          process.stdout.write(JSON.stringify({
            assets: { [file.id]: { type: "json", src: "assets/" + file.id + ".json" } },
            outputs: [{ path: file.id + ".json", contents: JSON.stringify({ from: file.rel }) }],
          }));
        });`,
    });
    const plugin: ToolingPlugin = {
      name: "maps",
      apiVersion: 1,
      assets: [{ name: "maps", extensions: [".map"], command: ["node", "importer.mjs"] }],
    };
    const { manifest, outputs, warnings } = await compileAssets(root, { plugins: [plugin], cache: false });
    expect(warnings).toEqual([]);
    expect(manifest.assets.level).toMatchObject({ type: "json", src: "assets/level.json" });
    expect(JSON.parse(outputs.get("level.json")?.toString() ?? "")).toEqual({ from: "level.map" });
  });

  it("reports importer failures as warnings and keeps going", async () => {
    const root = project({ "assets/a.bad": "x", "assets/ok.txt": "ok" });
    const plugin: ToolingPlugin = {
      name: "bad",
      apiVersion: 1,
      assets: [{ name: "bad", extensions: [".bad"], command: ["node", "-e", "process.exit(3)"] }],
    };
    const { manifest, warnings } = await compileAssets(root, { plugins: [plugin], cache: false });
    expect(Object.keys(manifest.assets)).toEqual(["ok"]);
    expect(warnings[0]).toMatch(/a\.bad: importer "bad" exited 3/);
  });
});

describe("validatePlugins", () => {
  it("rejects malformed, incompatible and duplicate plugins", () => {
    expect(() => validatePlugins([() => ({})])).toThrow(/forget to call the plugin factory/);
    expect(() => validatePlugins([{ name: "Bad Name", apiVersion: 1 }])).toThrow(/needs a kebab-case "name"/);
    expect(() => validatePlugins([undefined])).toThrow(/forget to call the plugin factory/);
    expect(() => validatePlugins([{ name: "x", apiVersion: 2 }])).toThrow(/targets apiVersion 2/);
    expect(() =>
      validatePlugins([
        { name: "x", apiVersion: 1 },
        { name: "x", apiVersion: 1 },
      ]),
    ).toThrow(/listed twice/);
    expect(() => validatePlugins([{ name: "x", apiVersion: 1, assets: [{ name: "i", extensions: [] }] }])).toThrow(/needs extensions/);
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
