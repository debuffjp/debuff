import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileAssets, findTenten, tenten } from "../src/index.js";

function project(files: Record<string, string>): string {
  // realpath: macOS's tmpdir is a symlink (/var -> /private/var), and module resolution returns the real path.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "debuff-")));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

/** Stands in for `tenten export`: writes name.png and name.json into the --out directory. */
function fakeTenten(frames: number, w: number, h: number) {
  const calls: string[][] = [];
  const exec = (command: string[]) => {
    calls.push(command);
    const file = command[command.indexOf("export") + 1] as string;
    const out = command[command.indexOf("--out") + 1] as string;
    const name = basename(file, ".tt");
    writeFileSync(join(out, `${name}.png`), `png:${file}`);
    const list: Record<string, unknown> = {};
    for (let i = 0; i < frames; i++) list[`${name} ${i}.ase`] = { frame: { x: i * w, y: 0, w, h }, duration: 100 };
    writeFileSync(join(out, `${name}.json`), JSON.stringify({ frames: list, meta: { size: { w: w * frames, h } } }));
  };
  return { exec, calls };
}

const compile = (root: string, exec: (command: string[]) => void) =>
  compileAssets(root, { plugins: [tenten({ exec })], cache: false, atlas: false });

describe("tenten importer", () => {
  it("turns a multi-frame .tt into a sprite sheet with one cell per frame", async () => {
    const root = project({ "assets/chars/slime.tt": "tt" });
    const fake = fakeTenten(2, 16, 16);
    const { manifest, outputs, importedBy, warnings } = await compile(root, fake.exec);
    expect(warnings).toEqual([]);
    expect(manifest.assets["chars/slime"]).toMatchObject({
      type: "image",
      src: "assets/chars/slime.png",
      group: "chars",
      grid: { frameWidth: 16, frameHeight: 16 },
    });
    expect(outputs.get("chars/slime.png")?.toString()).toBe(`png:${join(root, "assets", "chars", "slime.tt")}`);
    expect(importedBy["chars/slime"]).toBe("tenten");
    expect(warnings).toEqual([]);
    expect(fake.calls[0].slice(-4, -1)).toEqual(["export", join(root, "assets", "chars", "slime.tt"), "--out"]);
    expect(readFileSync(join(root, "assets/chars/slime.tt"), "utf8")).toBe("tt");
  });

  it("uses the grid from the name for a single-frame sheet like a font", async () => {
    const root = project({ "assets/font@6x9.tt": "tt" });
    const { manifest } = await compile(root, fakeTenten(1, 96, 54).exec);
    expect(manifest.assets.font).toMatchObject({ src: "assets/font.png", grid: { frameWidth: 6, frameHeight: 9 } });
  });

  it("leaves a single-frame image without a grid", async () => {
    const root = project({ "assets/bg.tt": "tt" });
    const { manifest } = await compile(root, fakeTenten(1, 32, 32).exec);
    expect(manifest.assets.bg).toEqual(expect.not.objectContaining({ grid: expect.anything() }));
  });

  it("warns and skips the file when tenten fails", async () => {
    const root = project({ "assets/bad.tt": "tt", "assets/ok.txt": "ok" });
    const { manifest, warnings } = await compile(root, () => {
      throw new Error("spawn npx ENOENT");
    });
    expect(Object.keys(manifest.assets)).toEqual(["ok"]);
    expect(warnings[0]).toMatch(/Skipped bad\.tt: tenten failed \(spawn npx ENOENT\)/);
  });

  it("falls back to npx when tenten is not installed next to the file", () => {
    const root = project({ "assets/x.tt": "tt" });
    const prev = process.env.TENTEN;
    delete process.env.TENTEN;
    try {
      expect(findTenten(join(root, "assets", "x.tt"))).toEqual(["npx", "-y", "--package", "@debuffjp/tenten", "tenten"]);
      expect(findTenten(join(root, "assets", "x.tt"), ["node", "t.js"])).toEqual(["node", "t.js"]);
    } finally {
      if (prev !== undefined) process.env.TENTEN = prev;
    }
  });

  it("runs the installed copy when the project depends on tenten", () => {
    const root = project({
      "assets/x.tt": "tt",
      "node_modules/@debuffjp/tenten/package.json": JSON.stringify({ name: "@debuffjp/tenten", version: "0.0.1" }),
      "node_modules/@debuffjp/tenten/bin/tenten.js": "",
    });
    const prev = process.env.TENTEN;
    delete process.env.TENTEN;
    try {
      expect(findTenten(join(root, "assets", "x.tt"))).toEqual([
        process.execPath,
        join(root, "node_modules", "@debuffjp", "tenten", "bin", "tenten.js"),
      ]);
    } finally {
      if (prev !== undefined) process.env.TENTEN = prev;
    }
  });
});

describe("tenten by default", () => {
  it("imports .tt files with no plugin configured", async () => {
    // A tenten that exists and fails: a missing path would fall back to fetching tenten with npx.
    const root = project({ "assets/x.tt": "tt", "fail.js": "process.exit(1);" });
    const prev = process.env.TENTEN;
    process.env.TENTEN = join(root, "fail.js");
    try {
      const { importedBy, warnings } = await compileAssets(root, { cache: false, atlas: false });
      expect(warnings[0]).toMatch(/Skipped x\.tt: tenten failed/);
      expect(importedBy).toEqual({});
    } finally {
      if (prev === undefined) delete process.env.TENTEN;
      else process.env.TENTEN = prev;
    }
    // Spawns a real node process, which takes over 5 s when the whole suite runs in parallel.
  }, 30_000);

  it("lets a configured tenten() plugin replace the default", async () => {
    const root = project({ "assets/x.tt": "tt" });
    const fake = fakeTenten(1, 8, 8);
    const { importedBy } = await compile(root, fake.exec);
    expect(importedBy.x).toBe("tenten");
    expect(fake.calls).toHaveLength(1);
  });
});
