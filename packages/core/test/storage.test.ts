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

describe("Storage across game updates", () => {
  const memory = (initial: Record<string, string> = {}) => {
    const mem = new Map(Object.entries(initial));
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) });
    return mem;
  };

  it("uses the default for a field whose type changed, and keeps the old save once", () => {
    const mem = memory({ g: JSON.stringify({ best: 412, name: "ada" }) });
    const s = new Storage("g", { best: { score: 0, time: 0 }, name: "" });
    expect(s.get("best")).toEqual({ score: 0, time: 0 });
    expect(s.get("name")).toBe("ada");
    expect(mem.get("g:backup")).toBe(JSON.stringify({ best: 412, name: "ada" }));
    mem.set("g", JSON.stringify({ best: "oops" }));
    new Storage("g", { best: { score: 0, time: 0 }, name: "" });
    expect(mem.get("g:backup")).toBe(JSON.stringify({ best: 412, name: "ada" }));
  });

  it("checks plain objects one level down and keeps fields the defaults don't have", () => {
    memory({ g: JSON.stringify({ opts: { volume: "loud", muted: true, extra: 1 }, old: 5 }) });
    const s = new Storage("g", { opts: { volume: 10, muted: false } });
    expect(s.data).toEqual({ opts: { volume: 10, muted: true, extra: 1 }, old: 5 });
  });

  it("tells arrays, null and objects apart", () => {
    memory({ g: JSON.stringify({ list: { a: 1 }, maybe: null, tags: ["x"] }) });
    const s = new Storage("g", { list: [] as number[], maybe: null as string | null, tags: [] as string[] });
    expect(s.data).toEqual({ list: [], maybe: null, tags: ["x"] });
  });

  it("migrates an older save once and stores the version", () => {
    const mem = memory({ g: JSON.stringify({ best: 412 }) });
    const migrate = vi.fn((old: Record<string, unknown>, from: number) => ({ best: { score: Number(old.best), time: 0 }, from }));
    const s = new Storage("g", { best: { score: 0, time: 0 }, from: -1 }, { version: 2, migrate });
    expect(s.data).toEqual({ best: { score: 412, time: 0 }, from: 0 });
    expect(mem.get("g:v")).toBe("2");
    expect(JSON.parse(mem.get("g") ?? "{}")).toEqual({ best: { score: 412, time: 0 }, from: 0 });
    expect(mem.get("g:backup")).toBe(JSON.stringify({ best: 412 }));
    new Storage("g", { best: { score: 0, time: 0 }, from: -1 }, { version: 2, migrate });
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it("starts a new save at the current version without migrating", () => {
    const mem = memory();
    const migrate = vi.fn(() => ({}));
    new Storage("g", { best: 0 }, { version: 3, migrate });
    expect(migrate).not.toHaveBeenCalled();
    expect(mem.get("g:v")).toBe("3");
  });

  it("falls back to fitting the old save if migrate throws", () => {
    memory({ g: JSON.stringify({ best: 7 }) });
    const s = new Storage(
      "g",
      { best: 0 },
      {
        version: 1,
        migrate: () => {
          throw new Error("bad");
        },
      },
    );
    expect(s.get("best")).toBe(7);
  });
});
