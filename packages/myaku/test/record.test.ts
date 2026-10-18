import { describe, expect, it } from "vitest";
import { checkBudgets, inject } from "../cli/record.js";
import type { Report } from "../src/index.js";

describe("myaku record", () => {
  it("puts myaku first in the page, before the game's scripts", () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><script type="module" src="/main.js"></script></head></html>`;
    const out = inject(html, 2400);
    expect(out.indexOf("/__myaku__/index.js")).toBeLessThan(out.indexOf("/main.js"));
    expect(out).toContain("myaku({ size: 2400 })");
    expect(inject("<canvas></canvas>", 10).startsWith("<script")).toBe(true);
  });

  it("checks only the budgets it was given", () => {
    const report = { intervalMs: { p50: 6, p95: 18, p99: 40, max: 80 }, hitchesPerMinute: 3 } as unknown as Report;
    expect(checkBudgets(report, {})).toEqual([]);
    expect(checkBudgets(report, { p95: 20, p99: 33, hitchesPerMinute: 5 })).toEqual([
      { name: "p95 frame time (ms)", limit: 20, actual: 18, ok: true },
      { name: "p99 frame time (ms)", limit: 33, actual: 40, ok: false },
      { name: "hitches per minute", limit: 5, actual: 3, ok: true },
    ]);
  });
});
