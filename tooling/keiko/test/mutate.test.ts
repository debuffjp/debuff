import { fileURLToPath } from "node:url";
import { mutate } from "henka";
import { describe, expect, it } from "vitest";
import { keikoAdapter, variants } from "../src/mutate.js";
import { runTests } from "../src/runner.js";

const root = fileURLToPath(new URL("./fixture-mutate", import.meta.url));

describe("keiko mutate", { timeout: 120_000 }, () => {
  it("pushes params to the ends of their range and checks seed and frame rate are ignored", async () => {
    const report = await mutate(keikoAdapter({ root }));
    const outcome = Object.fromEntries(report.outcomes.map((o) => [o.mutant.id, o.outcome]));
    expect(outcome).toEqual({
      "param:player.speed=0": "caught",
      "param:player.speed=240": "caught",
      "param:player.canJump=false": "missed",
      seed: "held",
      "fps:30": "brittle",
    });
    expect(report.outcomes.find((o) => o.mutant.id === "fps:30")?.failed).toEqual(["reaches x 60 in exactly 31 frames"]);
  });

  it("marks a mutation the game refuses, so it counts as unviable rather than caught", async () => {
    const report = await runTests({ root, files: ["tests/moves.test.js"], filter: "walks", mutation: { params: { "enemy.speed": 1 } } });
    expect(report.results[0]?.error?.kind).toBe("MutationError");
  });
});

describe("variants", () => {
  it("goes to each end of a declared range, skipping the current value", () => {
    expect(variants(140, 0, 600)).toEqual([0, 600]);
    expect(variants(0, 0, 10)).toEqual([10]);
  });

  it("tries 0 and double without a range, and flips booleans", () => {
    expect(variants(120)).toEqual([0, 240]);
    expect(variants(0)).toEqual([1]);
    expect(variants(true)).toEqual([false]);
  });
});
