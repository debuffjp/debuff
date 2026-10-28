import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initGit } from "../src/index.js";

const hasGit = !spawnSync("git", ["--version"]).error;
let dir: string | undefined;
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** A fresh folder with one file, outside any repository. */
const project = () => {
  dir = mkdtempSync(join(tmpdir(), "create-debuff-git-"));
  const game = join(dir, "game");
  mkdirSync(game);
  writeFileSync(join(game, "main.ts"), "export {};\n");
  return game;
};
const git = (cwd: string, ...args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();

describe.skipIf(!hasGit)("initGit", () => {
  it("starts a repository with one commit holding every file", () => {
    const game = project();
    process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "Test";
    process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "test@example.com";
    expect(initGit(game, "New debuff game from the basic template")).toEqual({ status: "committed" });
    expect(git(game, "log", "--format=%s")).toBe("New debuff game from the basic template");
    expect(git(game, "status", "--short")).toBe("");
  });

  it("leaves a folder inside another repository alone", () => {
    const game = project();
    spawnSync("git", ["init", "-q"], { cwd: dir });
    expect(initGit(game, "x")).toEqual({ status: "skipped", reason: "the folder is already inside a git repository" });
  });

  it("never invents an identity: without one it stops after git init and says why", () => {
    const game = project();
    const empty = join(dir as string, "gitconfig");
    writeFileSync(empty, "[user]\n\tuseConfigOnly = true\n");
    process.env.GIT_CONFIG_GLOBAL = empty;
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    for (const k of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "EMAIL"]) delete process.env[k];
    expect(initGit(game, "x")).toEqual({ status: "initialised", reason: "set git user.name and user.email, then commit" });
    expect(git(game, "rev-parse", "--is-inside-work-tree")).toBe("true");
  });
});
