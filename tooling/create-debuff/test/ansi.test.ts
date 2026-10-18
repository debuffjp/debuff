import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return (await import("../src/ansi.js")).default;
}

describe("ansi", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("colours when forced, and keeps the outer style after a nested one", async () => {
    const pc = await load({ FORCE_COLOR: "1", NO_COLOR: undefined });
    expect(pc.isColorSupported).toBe(true);
    expect(pc.red("x")).toBe("\x1b[31mx\x1b[39m");
    expect(pc.red(`a ${pc.green("b")} c`)).toBe("\x1b[31ma \x1b[32mb\x1b[31m c\x1b[39m");
    expect(pc.bold(`a ${pc.dim("b")} c`)).toBe("\x1b[1ma \x1b[2mb\x1b[22m\x1b[1m c\x1b[22m");
    expect(pc.dim(3)).toBe("\x1b[2m3\x1b[22m");
  });

  it("is plain text under NO_COLOR", async () => {
    const pc = await load({ NO_COLOR: "1" });
    expect(pc.isColorSupported).toBe(false);
    expect(pc.bold(pc.red("plain"))).toBe("plain");
  });
});
