import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEmptyDir, listTemplates, packageName, scaffold } from "../src/index.js";

const tmp = () => mkdtempSync(join(tmpdir(), "create-debuff-"));

describe("scaffold", () => {
  it("lists templates with metadata", () => {
    expect(listTemplates()).toContainEqual(expect.objectContaining({ id: "basic", title: "Basic" }));
  });

  it("copies a template, restores .gitignore, names the package and skips build output", () => {
    const dest = join(tmp(), "My Game!");
    scaffold({ dir: dest });
    expect(existsSync(join(dest, ".gitignore"))).toBe(true);
    expect(existsSync(join(dest, "gitignore"))).toBe(false);
    expect(existsSync(join(dest, "template.json"))).toBe(false);
    for (const skipped of ["node_modules", "dist", ".debuff"]) expect(existsSync(join(dest, skipped))).toBe(false);
    expect(JSON.parse(readFileSync(join(dest, "package.json"), "utf8")).name).toBe("my-game-");
  });

  it("refuses non-empty directories and unknown templates", () => {
    const dir = tmp();
    writeFileSync(join(dir, "keep.txt"), "x");
    expect(() => scaffold({ dir })).toThrow(/not empty/);
    const empty = join(tmp(), "x");
    mkdirSync(empty);
    expect(() => scaffold({ dir: empty, template: "nope" })).toThrow(/Unknown template "nope". Available: basic/);
  });

  it("derives npm-safe package names", () => {
    expect(packageName("/a/Cool Game")).toBe("cool-game");
    expect(packageName("/a/..hidden")).toBe("hidden");
    expect(isEmptyDir(join(tmp(), "missing"))).toBe(true);
  });
});
