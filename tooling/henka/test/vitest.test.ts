import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { mutate } from "../src/index.js";
import { henka, type PluginState } from "../src/plugin.js";
import { changedLines, gitEnv, sourceFiles, vitestAdapter } from "../src/vitest.js";

const fixture = join(import.meta.dirname, "fixture-vitest");

describe("vitestAdapter", () => {
  test("judges source mutants by the tests that load the file", async () => {
    const report = await mutate(vitestAdapter({ root: fixture, paths: ["src/score.ts", "src/unused.ts"] }), { jobs: 2 });
    const by = Object.fromEntries(report.outcomes.map((o) => [o.mutant.label.replace(/^\S+ /, ""), o.outcome]));
    expect(by).toMatchObject({
      // combo(3) is never tested, so moving the boundary goes unnoticed.
      "hits < 3 → hits <= 3": "missed",
      "hits * 2 → hits / 2": "caught",
      "score > best → score >= best": "missed",
      "{ return score > best; } → { return true; }": "caught",
    });
    const unused = report.outcomes.filter((o) => o.mutant.label.startsWith("src/unused.ts"));
    expect(unused.map((o) => [o.outcome, o.reason])).toEqual([
      ["missed", "no test loads this file"],
      ["missed", "no test loads this file"],
    ]);
    expect(report.counts).toEqual({ caught: 7, missed: 4, held: 0, brittle: 0, unviable: 0 });
  }, 60_000);

  test("kills a mutant that hangs the tests and carries on in a fresh child", async () => {
    const report = await mutate(vitestAdapter({ root: fixture, paths: ["src/loop.ts"], timeoutMs: 10_000 }));
    const by = Object.fromEntries(report.outcomes.map((o) => [o.mutant.label.replace(/^\S+ /, ""), [o.outcome, o.failed]]));
    expect(by["steps++ → steps--"]).toEqual(["caught", ["(timed out after 10 s)"]]);
    expect(by["n / 2 → n * 2"]?.[0]).toBe("caught");
    expect(report.counts.missed).toBe(0);
  }, 90_000);

  test("finds source files and leaves tests and declarations out", () => {
    expect(sourceFiles(fixture)).toEqual(["src/loop.ts", "src/score.ts", "src/unused.ts"]);
    expect(() => sourceFiles(fixture, ["nope"])).toThrow("nope doesn't exist");
  });
});

describe("henka plugin", () => {
  const mutant = {
    id: "x",
    label: "x",
    expect: "noticed" as const,
    file: "src/unused.ts",
    line: 1,
    column: 1,
    start: 0,
    end: 1,
    replacement: "2",
  };
  const transform = (state: PluginState, code: string, id: string) =>
    (henka({ root: fixture, state }).transform as (code: string, id: string) => { code: string } | undefined)(code, id);
  const original = "export const double = (n: number) => n * 2;\n";

  test("swaps in the mutant for its own file only", () => {
    const state: PluginState = { mutant };
    expect(transform(state, original, join(fixture, "src/unused.ts"))?.code).toBe(`2${original.slice(1)}`);
    expect(transform(state, original, join(fixture, "src/score.ts"))).toBeUndefined();
    expect(transform({}, original, join(fixture, "src/unused.ts"))).toBeUndefined();
    expect(state.refused).toBeUndefined();
  });

  test("refuses code another plugin already changed", () => {
    const state: PluginState = { mutant };
    expect(transform(state, `// banner\n${original}`, `${join(fixture, "src/unused.ts")}?v=1`)).toBeUndefined();
    expect(state.refused).toContain("another plugin changed src/unused.ts");
  });
});

// These tests can run inside a git hook (pre-push), where GIT_DIR points at the real repository: every git
// call here goes through gitEnv(), or it would act on that repository.
describe("changedLines", () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, env: gitEnv(), encoding: "utf8" });

  test("reads changed lines from git and counts new files as all changed", () => {
    const dir = mkdtempSync(join(tmpdir(), "henka-git-"));
    const outer = mkdtempSync(join(tmpdir(), "henka-outer-"));
    const saved = process.env.GIT_DIR;
    try {
      git(outer, "init", "-q");
      git(dir, "init", "-q");
      writeFileSync(join(dir, "a.ts"), "one\ntwo\nthree\nfour\n");
      git(dir, "add", ".");
      git(dir, "commit", "-qm", "start");
      writeFileSync(join(dir, "a.ts"), "one\nTWO\nthree\nfour\nfive\n");
      writeFileSync(join(dir, "b.ts"), "new\n");
      // As in a hook: henka must still read the repository it runs in.
      process.env.GIT_DIR = join(outer, ".git");
      expect(changedLines(dir, "HEAD")).toEqual(
        new Map<string, Set<number> | "all">([
          ["a.ts", new Set([2, 5])],
          ["b.ts", "all"],
        ]),
      );
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
      rmSync(dir, { recursive: true, force: true });
      rmSync(outer, { recursive: true, force: true });
    }
  });
});
