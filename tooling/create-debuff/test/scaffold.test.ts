import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isEmptyDir,
  isRemoteTemplate,
  listTemplates,
  OFFICIAL_TEMPLATES,
  ownVersion,
  PROJECT_SKILLS,
  packageName,
  pinnedSource,
  projectSkillsVersion,
  resolveTemplate,
  SKILL_DIRS,
  scaffold,
  templateOptions,
  templatesDir,
} from "../src/index.js";

const tmp = () => mkdtempSync(join(tmpdir(), "create-debuff-"));

describe("scaffold", () => {
  it("lists templates with metadata", () => {
    expect(listTemplates()).toContainEqual(expect.objectContaining({ id: "basic", title: "Basic", kind: "base" }));
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

  it("writes the agent skills for this release into every agent's skills folder", () => {
    const dest = join(tmp(), "skilled");
    scaffold({ dir: dest });
    const version = ownVersion();
    for (const dir of SKILL_DIRS)
      for (const name of PROJECT_SKILLS) {
        const text = readFileSync(join(dest, dir, name, "SKILL.md"), "utf8");
        expect(text).toMatch(new RegExp(`^---\\nname: ${name}\\n`));
        expect(text).toContain(`metadata:\n  debuff-version: "${version}"\n---`);
      }
    expect(projectSkillsVersion(dest)).toBe(version);
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

describe("remote templates", () => {
  it("recognises git-hosted sources and keeps them out of the local path", () => {
    expect(isRemoteTemplate("github:me/my-template")).toBe(true);
    expect(isRemoteTemplate("gitlab:me/repo/sub#v1")).toBe(true);
    expect(isRemoteTemplate("basic")).toBe(false);
    expect(() => scaffold({ dir: join(tmp(), "x"), template: "github:me/t" })).toThrow(/use create\(\) or scaffoldRemote\(\)/);
  });
});

describe("official templates", () => {
  it("each official template exists in the repo, is not bundled into the package, and agrees on its metadata", () => {
    for (const t of OFFICIAL_TEMPLATES) {
      const meta = JSON.parse(readFileSync(join(templatesDir(), t.id, "template.json"), "utf8"));
      expect(meta.bundled, t.id).toBe(false);
      expect({ title: meta.title, kind: meta.kind, description: meta.description }, t.id).toEqual({
        title: t.title,
        kind: t.kind,
        description: t.description,
      });
      expect(t.source).toBe(`github:debuffjp/debuff/templates/${t.id}`);
    }
  });

  it("lists base templates before examples, and resolves locally in a repo checkout", () => {
    const all = listTemplates();
    expect(all.map((t) => t.id)).toEqual(
      expect.arrayContaining(["basic", "topdown", "isometric", "sidescroller", "pointclick", "platformer", "mossfell", "squish"]),
    );
    const firstExample = all.findIndex((t) => t.kind === "example");
    expect(all.slice(0, firstExample).every((t) => t.kind === "base")).toBe(true);
    expect(all.slice(firstExample).every((t) => t.kind === "example")).toBe(true);
    expect(all.find((t) => t.id === "squish")?.title).toBe("Match 3");
    expect(resolveTemplate("platformer").kind).toBe("local");
    expect(resolveTemplate("github:me/x")).toEqual({ kind: "remote", source: "github:me/x" });
  });
});

describe("templateOptions", () => {
  it("puts a disabled heading above each kind and skips empty kinds", () => {
    const options = templateOptions([
      { id: "iso", title: "Isometric", description: "d", kind: "base" },
      { id: "basic", title: "Basic", description: "d", kind: "base" },
    ]);
    expect(options.map((o) => o.value)).toEqual(["#base", "iso", "basic"]);
    expect(options[0]?.disabled).toBe(true);
    expect(options[1]?.disabled).toBeUndefined();
  });

  it("lists examples under their own heading", () => {
    const options = templateOptions([
      { id: "basic", title: "Basic", description: "d", kind: "base" },
      { id: "squish", title: "Match 3", description: "d", kind: "example" },
    ]);
    expect(options.map((o) => o.value)).toEqual(["#base", "basic", "#example", "squish"]);
  });
});

describe("pinnedSource", () => {
  it("pins official templates to the release tag, except in the monorepo or when a ref is given", () => {
    expect(pinnedSource("github:debuffjp/debuff/templates/platformer", "0.2.0")).toBe(
      "github:debuffjp/debuff/templates/platformer#create-debuff@0.2.0",
    );
    expect(pinnedSource("github:debuffjp/debuff/templates/platformer", "0.0.0")).toBe("github:debuffjp/debuff/templates/platformer");
    expect(pinnedSource("github:me/x#dev", "0.2.0")).toBe("github:me/x#dev");
  });
});
