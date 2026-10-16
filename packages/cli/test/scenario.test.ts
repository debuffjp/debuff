import { describe, expect, it } from "vitest";
import { compare } from "../src/scenario.js";

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
