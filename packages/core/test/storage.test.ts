import { afterEach, describe, expect, it, vi } from "vitest";
import { Storage } from "../src/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("Storage", () => {
  it("persists and merges defaults", () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) });
    const s = new Storage("t", { best: 0, muted: false });
    s.set("best", 42);
    expect(new Storage("t", { best: 0, muted: false, extra: 1 }).data).toEqual({ best: 42, muted: false, extra: 1 });
  });

  it("survives throwing storage and corrupt data", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("quota");
      },
    });
    const s = new Storage("t", { best: 0 });
    expect(s.get("best")).toBe(0);
    expect(() => s.set("best", 5)).not.toThrow();
    expect(s.get("best")).toBe(5);
  });
});
