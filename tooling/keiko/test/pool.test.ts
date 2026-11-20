import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { slowestFirst } from "../src/pool.js";
import { runTests, type TestReport } from "../src/runner.js";

const fixture = fileURLToPath(new URL("./fixture", import.meta.url));

/** What a report says, without the timings. */
const outcome = (report: TestReport) => ({
  ok: report.ok,
  counts: [report.passed, report.failed, report.skipped, report.todo],
  results: report.results.map((r) => [r.file, r.fullName, r.status, r.error?.message, r.error?.game, r.logs]),
  outside: report.outside.map((e) => e.message),
});

describe("runTests with jobs", { timeout: 180_000 }, () => {
  it("reports what one process reports, in file order", async () => {
    const files = [
      "tests/dot.test.ts",
      "hooks/before-throws.test.ts",
      "hooks/replaced-game.test.ts",
      "broken/syntax.test.ts",
      "late/late.test.ts",
    ];
    const serial = await runTests({ root: fixture, files });
    const streamed: string[] = [];
    const parallel = await runTests({ root: fixture, files, jobs: 3, onResult: (r) => streamed.push(r.fullName) });
    expect(outcome(parallel)).toEqual(outcome(serial));
    expect(streamed.sort()).toEqual(serial.results.map((r) => r.fullName).sort());
  });

  it("fails a filter only when no worker's file matched it", async () => {
    const files = ["tests/dot.test.ts", "late/late.test.ts"];
    const some = await runTests({ root: fixture, files, jobs: 2, filter: "WALKS" });
    expect(some.results.map((r) => r.name)).toEqual(["walks right at its speed"]);
    expect(some.outside).toEqual([]);
    const none = await runTests({ root: fixture, files, jobs: 2, filter: "no such test" });
    expect(none.outside.map((e) => e.message)).toEqual([expect.stringMatching(/no test name contains "no such test"/)]);
  });

  it("refuses a vite config, which can't reach the workers", async () => {
    await expect(runTests({ root: fixture, files: ["tests/dot.test.ts", "late/late.test.ts"], jobs: 2, vite: {} })).rejects.toThrow(/vite/);
  });

  describe("with a queue", () => {
    const tmp = mkdtempSync(join(fileURLToPath(new URL(".", import.meta.url)), ".pool-"));
    cpSync(fileURLToPath(new URL("./fixture-changed", import.meta.url)), tmp, { recursive: true });
    afterAll(() => rmSync(tmp, { recursive: true, force: true }));
    const edit = (file: string, from: string, to: string) => {
      const path = join(tmp, file);
      writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
    };

    it("merges what every worker recorded into one queue", async () => {
      const ran = async () => {
        const report = await runTests({ root: tmp, changed: true, jobs: 2 });
        expect(report.ok).toBe(true);
        return { names: report.results.map((r) => r.name), unchanged: report.unchanged, due: Object.values(report.due ?? {}) };
      };
      expect(await ran()).toEqual({ names: ["shoots", "walks"], unchanged: 0, due: ["new", "new"] });
      expect(await ran()).toEqual({ names: [], unchanged: 2, due: [] });
      edit("src/main.js", "shots += 1", "shots += 2");
      expect(await ran()).toEqual({ names: ["shoots"], unchanged: 1, due: ["code"] });
    });

    it("runs in one process when a file has .only, so it still narrows every file", async () => {
      edit("tests/walk.test.js", 'test("walks"', 'test.only("walks"');
      const report = await runTests({ root: tmp, jobs: 2 });
      expect(report.results.map((r) => [r.name, r.status])).toEqual([
        ["shoots", "skip"],
        ["walks", "pass"],
      ]);
    });
  });
});

describe("slowestFirst", () => {
  it("starts files with no record, then the slowest", () => {
    const last = new Map([
      ["a.test.ts › one", 10],
      ["a.test.ts › two", 50],
      ["b.test.ts › one", 100],
      ["c.test.ts › one", 5],
    ]);
    expect(slowestFirst(["a.test.ts", "b.test.ts", "c.test.ts", "new.test.ts"], last)).toEqual([
      "new.test.ts",
      "b.test.ts",
      "a.test.ts",
      "c.test.ts",
    ]);
  });
});
