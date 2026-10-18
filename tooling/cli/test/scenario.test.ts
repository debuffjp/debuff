import { describe, expect, it } from "vitest";
import { stepUntil } from "../src/scenario/browser.js";
import { captureDiffMessage, compare, pick } from "../src/scenario/index.js";

describe("compare", () => {
  it("passes matching comparisons", () => {
    expect(compare(5, { gt: 4, lt: 6, gte: 5, lte: 5 })).toBeUndefined();
    expect(compare({ a: 1 }, { eq: { a: 1 } })).toBeUndefined();
    expect(compare(10.2, { approx: [10, 0.5] })).toBeUndefined();
  });

  it("explains failures", () => {
    expect(compare(3, { gt: 4 })).toBe("expected > 4, got 3");
    expect(compare("menu", { eq: "play" })).toBe('expected "play", got "menu"');
    expect(compare(undefined, { gt: 0 })).toMatch(/got undefined/);
  });
});

describe("captureDiffMessage", () => {
  it("names the actual, baseline and diff images and says how to accept the change", () => {
    const root = process.platform === "win32" ? "C:game" : "/game";
    const at = (...p: string[]) => [root, ...p].join(process.platform === "win32" ? "\\" : "/");
    const msg = captureDiffMessage(
      "popped",
      {
        name: "popped",
        status: "diff",
        diffRatio: 0.995,
        path: at(".debuff", "captures", "s", "popped.png"),
        baseline: at("scenarios", "__baselines__", "s", "popped.win32.png"),
        diff: at(".debuff", "captures", "s", "popped.diff.png"),
      },
      0.002,
      root,
    );
    expect(msg).toContain("99.50% of pixels");
    expect(msg).toContain("actual:   .debuff/captures/s/popped.png");
    expect(msg).toContain("baseline: scenarios/__baselines__/s/popped.win32.png");
    expect(msg).toContain("diff:     .debuff/captures/s/popped.diff.png");
    expect(msg).toContain("If this change is intended, run `npx debuff scenario --update`.");
  });
});

describe("pick", () => {
  it("reads event counts as 0 until the first emit", () => {
    const state = { events: { coin: 2 }, state: { x: 1 } };
    expect(pick(state, "events.coin")).toBe(2);
    expect(pick(state, "events.win")).toBe(0);
    expect(pick(state, "state.y")).toBeUndefined();
  });
});

describe("stepUntil", () => {
  it("steps until the conditions hold, or gives up after within", () => {
    let tick = 0;
    const hooks = { state: () => ({ tick, events: tick >= 5 ? { coin: 1 } : {} }), step: () => tick++ };
    (globalThis as { window?: unknown }).window = { __DEBUFF_DEV__: hooks };
    try {
      expect(stepUntil([{ "events.coin": { gte: 1 } }, 60])).toEqual({ ticks: 5, met: true });
      expect(stepUntil([{ tick: { eq: 5 } }, 3])).toEqual({ ticks: 0, met: true });
      expect(stepUntil([{ tick: { gt: 100 } }, 3])).toEqual({ ticks: 3, met: false });
      expect(tick).toBe(8);
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});
