import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Adapter, BaselineError, formatReport, type Mutant, type MutantRun, mutate, type RunResult, writeOut } from "../src/index.js";

const run = (failed: string[] = []): RunResult => ({ failed, passed: 3 - failed.length, durationMs: 5 });

function adapter(mutants: Mutant[], results: Record<string, MutantRun>, baseline = run()): Adapter {
  return { name: "fake", baseline: async () => baseline, mutants: () => mutants, run: async (m) => results[m.id] ?? run() };
}

const speed: Mutant = { id: "param:speed=0", label: "speed 140 → 0", expect: "noticed" };
const accel: Mutant = { id: "param:accel=0", label: "accel 1200 → 0", expect: "noticed" };
const seed: Mutant = { id: "seed", label: "seed 1 → 7920", expect: "ignored" };
const fps: Mutant = { id: "fps", label: "60 → 30 fps", expect: "ignored" };
const big: Mutant = { id: "param:size=big", label: "size → big", expect: "noticed" };

describe("mutate", () => {
  it("judges noticed mutants by a failure and ignored ones by none", async () => {
    const report = await mutate(
      adapter([speed, accel, seed, fps, big], {
        [speed.id]: run(["moves"]),
        [fps.id]: run(["reaches top speed in 15 frames"]),
        [big.id]: { unviable: "outside the param's range" },
      }),
    );
    expect(report.outcomes.map((o) => [o.mutant.id, o.outcome])).toEqual([
      [speed.id, "caught"],
      [accel.id, "missed"],
      [seed.id, "held"],
      [fps.id, "brittle"],
      [big.id, "unviable"],
    ]);
    expect(report.counts).toEqual({ caught: 1, missed: 1, held: 1, brittle: 1, unviable: 1 });
    expect(report.ok).toBe(false);
  });

  it("is ok when every mutant is caught or held", async () => {
    const report = await mutate(adapter([speed, seed], { [speed.id]: run(["moves"]) }));
    expect(report.ok).toBe(true);
  });

  it("refuses to judge against a failing baseline", async () => {
    await expect(mutate(adapter([speed], {}, run(["broken"])))).rejects.toBeInstanceOf(BaselineError);
  });

  it("rejects an adapter that lists a mutant twice", async () => {
    await expect(mutate(adapter([speed, speed], {}))).rejects.toThrow(/twice/);
  });
});

describe("output", () => {
  it("writes outcomes.json and a list per outcome", async () => {
    const report = await mutate(adapter([speed, accel, big], { [speed.id]: run(["moves"]), [big.id]: { unviable: "no" } }));
    const dir = join(mkdtempSync(join(tmpdir(), "henka-")), "mutants.out");
    writeOut(report, dir);
    expect(JSON.parse(readFileSync(join(dir, "outcomes.json"), "utf8")).counts.missed).toBe(1);
    expect(readFileSync(join(dir, "missed.txt"), "utf8")).toBe("accel 1200 → 0\n");
    expect(readFileSync(join(dir, "caught.txt"), "utf8")).toBe("speed 140 → 0 (failed: moves)\n");
    expect(readFileSync(join(dir, "unviable.txt"), "utf8")).toBe("size → big: no\n");
    expect(readFileSync(join(dir, "brittle.txt"), "utf8")).toBe("");
  });

  it("summarises counts and lists only what needs work", async () => {
    const text = formatReport(await mutate(adapter([speed, accel], { [speed.id]: run(["moves"]) })));
    expect(text).toContain("2 mutants: 1 caught, 1 missed");
    expect(text).toContain("  accel 1200 → 0");
    expect(text).not.toContain("speed 140");
  });
});
