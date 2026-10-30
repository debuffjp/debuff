import { mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSET_TYPES_FILE, assetTypes, compileAssets, typecheck, writeAssetTypes } from "../src/index.js";

const repoModules = dirname(dirname(createRequire(import.meta.url).resolve("typescript/package.json")));

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "debuff-asset-types-"));
  symlinkSync(repoModules, join(root, "node_modules"), "junction");
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2022", "DOM"],
        skipLibCheck: true,
      },
      include: ["src", ASSET_TYPES_FILE],
    }),
  );
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const game = (calls: string) => `import { Assets } from "@debuffjp/assets";
declare const assets: Assets;
${calls}
`;

describe("asset types", () => {
  it("lists every asset with its type and group", async () => {
    const root = project({ "assets/hero.png": "x", "assets/level1/map.json": "{}" });
    const { manifest } = await compileAssets(root, { atlas: false });
    const text = assetTypes(manifest);
    expect(text).toContain(`"hero": { type: "image"; group: "default" };`);
    expect(text).toContain(`"level1/map": { type: "json"; group: "level1" };`);
  });

  it("makes a misspelt id, a wrong-type id or an unknown group a type error", { timeout: 60_000 }, async () => {
    const root = project({
      "assets/hero.png": "x",
      "assets/level1/map.json": "{}",
      "src/main.ts": game(`assets.image("hero");
assets.json("level1/map");
await assets.load(["default", "level1"]);
assets.image("heor");
assets.image("level1/map");
await assets.load("level2");`),
    });
    const { manifest } = await compileAssets(root, { atlas: false });
    writeAssetTypes(root, manifest);
    const r = await typecheck(root);
    const errors = r.diagnostics;
    expect(r.reason).toBeUndefined();
    expect(errors.map((e) => e.line)).toEqual([6, 7, 8]);
    expect(errors[0]?.message).toContain('"heor"');
  });

  it("leaves ids as plain strings when no types were generated", async () => {
    const root = project({ "src/main.ts": game(`assets.image("anything");`) });
    const r = await typecheck(root);
    expect(r).toMatchObject({ ok: true, diagnostics: [] });
  });

  it("only rewrites the file when the assets changed", async () => {
    const root = project({ "assets/hero.png": "x" });
    const { manifest } = await compileAssets(root, { atlas: false });
    expect(writeAssetTypes(root, manifest)).toBe(true);
    const before = statSync(join(root, ASSET_TYPES_FILE)).mtimeMs;
    expect(writeAssetTypes(root, manifest)).toBe(false);
    expect(statSync(join(root, ASSET_TYPES_FILE)).mtimeMs).toBe(before);
    expect(readFileSync(join(root, ASSET_TYPES_FILE), "utf8")).toBe(assetTypes(manifest));
  });
});
