import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aseprite, compileAssets, findAseprite, validatePlugins } from "../src/index.js";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "debuff-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

/** Stands in for Aseprite: writes the sheet and its JSON where `--sheet` and `--data` point. */
function fakeAseprite(frames: number, w: number, h: number) {
  const calls: string[][] = [];
  const exec = (_bin: string, args: string[]) => {
    calls.push(args);
    const at = (flag: string) => args[args.indexOf(flag) + 1] as string;
    writeFileSync(at("--sheet"), `png:${args[1]}`);
    const list = Array.from({ length: frames }, (_, i) => ({ frame: { x: i * w, y: 0, w, h } }));
    writeFileSync(at("--data"), JSON.stringify({ frames: list, meta: { size: { w: w * frames, h } } }));
  };
  return { exec, calls };
}

const compile = (root: string, exec: (bin: string, args: string[]) => void) =>
  compileAssets(root, { plugins: [aseprite({ exec })], cache: false, atlas: false });

describe("aseprite importer", () => {
  it("turns a multi-frame file into a sprite sheet with one cell per frame", async () => {
    const root = project({ "assets/chars/hero.aseprite": "ase" });
    const fake = fakeAseprite(4, 16, 24);
    const { manifest, outputs, importedBy, warnings } = await compile(root, fake.exec);
    expect(manifest.assets["chars/hero"]).toMatchObject({
      type: "image",
      src: "assets/chars/hero.png",
      group: "chars",
      grid: { frameWidth: 16, frameHeight: 24 },
    });
    expect(outputs.get("chars/hero.png")?.toString()).toBe(`png:${join(root, "assets", "chars", "hero.aseprite")}`);
    expect(importedBy["chars/hero"]).toBe("aseprite");
    expect(warnings).toEqual([]);
    expect(fake.calls[0]).toEqual(expect.arrayContaining(["-b", "--sheet-type", "rows", "--format", "json-array"]));
    // The source is untouched.
    expect(readFileSync(join(root, "assets/chars/hero.aseprite"), "utf8")).toBe("ase");
  });

  it("uses the grid from the name for a single-frame sheet like a font", async () => {
    const root = project({ "assets/font@6x9.aseprite": "ase" });
    const { manifest } = await compile(root, fakeAseprite(1, 96, 54).exec);
    expect(manifest.assets.font).toMatchObject({ src: "assets/font.png", grid: { frameWidth: 6, frameHeight: 9 } });
  });

  it("leaves a single-frame image without a grid", async () => {
    const root = project({ "assets/bg.ase": "ase" });
    const { manifest } = await compile(root, fakeAseprite(1, 32, 32).exec);
    expect(manifest.assets.bg).toMatchObject({ src: "assets/bg.png" });
    expect(manifest.assets.bg?.grid).toBeUndefined();
  });

  it("warns instead of failing when Aseprite errors", async () => {
    const root = project({ "assets/bad.aseprite": "ase" });
    const { manifest, warnings } = await compile(root, () => {
      throw new Error("Error: file corrupt\nmore");
    });
    expect(manifest.assets.bad).toBeUndefined();
    expect(warnings).toEqual(["Skipped bad.aseprite: Aseprite failed (Error: file corrupt)"]);
  });

  it("warns with a fix when Aseprite isn't installed", async () => {
    const root = project({ "assets/hero.aseprite": "ase" });
    const { warnings } = await compileAssets(root, { plugins: [aseprite({ binary: join(root, "nope.exe") })], cache: false, atlas: false });
    expect(warnings[0]).toMatch(/Aseprite not found.*ASEPRITE/);
  });

  it("finds an explicit binary or the ASEPRITE variable", () => {
    const root = project({ "bin/aseprite": "" });
    const bin = join(root, "bin/aseprite");
    expect(findAseprite(bin)).toBe(bin);
    expect(findAseprite(join(root, "missing"))).toBeUndefined();
    const before = process.env.ASEPRITE;
    process.env.ASEPRITE = bin;
    try {
      expect(findAseprite()).toBe(bin);
    } finally {
      if (before === undefined) delete process.env.ASEPRITE;
      else process.env.ASEPRITE = before;
    }
  });

  it("is a valid tooling plugin", () => {
    expect(validatePlugins([aseprite()])).toHaveLength(1);
  });
});
