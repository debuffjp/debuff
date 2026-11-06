import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { changedSpans, touchesUsed } from "../src/impact.js";
import { runTests } from "../src/runner.js";

describe("changedSpans and touchesUsed", () => {
  const before = "function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}\nb();";
  const idle: [number, number][] = [[14, 28]]; // a's body, which never ran, up to and including its "}"

  it("lets edits and insertions inside code that never ran through, and nothing else", () => {
    const inA = changedSpans(before, before.replace("return 1", "return 10"));
    const added = changedSpans(before, before.replace("  return 1;\n", "  log();\n  return 1;\n"));
    const inB = changedSpans(before, before.replace("return 2", "return 20"));
    const appended = changedSpans(before, `${before}\nb();`);
    expect(touchesUsed(inA, idle, before)).toBe(false);
    expect(touchesUsed(added, idle, before)).toBe(false);
    expect(touchesUsed(inB, idle, before)).toBe(true);
    expect(touchesUsed(appended, idle, before)).toBe(true);
    expect(changedSpans(before, before)).toEqual([]);
  });
});

describe("runTests with changed", { timeout: 120_000 }, () => {
  const tmp = mkdtempSync(join(fileURLToPath(new URL(".", import.meta.url)), ".changed-"));
  cpSync(fileURLToPath(new URL("./fixture-changed", import.meta.url)), tmp, { recursive: true });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const edit = (file: string, from: string, to: string) => {
    const path = join(tmp, file);
    writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
  };
  const ran = async () => {
    const report = await runTests({ root: tmp, changed: true });
    expect(report.ok).toBe(true);
    return { names: report.results.map((r) => r.name), unchanged: report.unchanged, due: Object.values(report.due ?? {}) };
  };

  it("runs only the tests that ran the code or read the file that changed", async () => {
    expect(await ran()).toEqual({ names: ["walks", "shoots"], unchanged: 0, due: ["new", "new"] });
    expect(await ran()).toEqual({ names: [], unchanged: 2, due: [] });
    edit("src/main.js", "shots += 1", "shots += 2");
    expect(await ran()).toEqual({ names: ["shoots"], unchanged: 1, due: ["code"] });
    edit("src/main.js", "let level;", "let level;\nconst unused = () => 0;");
    expect((await ran()).names).toEqual(["walks", "shoots"]);
    edit("level.json", "one", "two");
    expect(await ran()).toEqual({ names: ["walks", "shoots"], unchanged: 0, due: ["input", "input"] });
    // Another queue has its own last run: everything is new to it.
    expect((await runTests({ root: tmp, changed: true, queue: "push" })).results).toHaveLength(2);
  });
});
