import { describe, expect, it } from "vitest";
import { badge, banner, deeb, PALETTE, paint } from "../src/index.js";

// Strip ANSI so assertions hold whether or not the test terminal supports colour.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const plain = (s: string) => s.replace(ANSI, "");

describe("brand", () => {
  it("defines the palette once", () => {
    expect(PALETTE.lime).toBe("#a3e635");
    expect(Object.keys(PALETTE)).toEqual(["lime", "limeSoft", "ink", "sky", "pink", "amber", "violet", "red"]);
  });

  it("paints without changing the text", () => {
    expect(plain(paint("pink", "hero"))).toBe("hero");
    expect(plain(badge())).toMatch(/debuff/);
  });

  it("draws deeb as three half-block rows of eight cells, or nothing without truecolor", () => {
    const art = deeb("happy");
    if (art.length === 0) return; // no 24-bit colour in this terminal
    expect(art).toHaveLength(3);
    for (const row of art) expect(plain(row)).toHaveLength(8);
  });

  it("puts text beside deeb, or falls back to the badge", () => {
    const out = plain(banner("oops", ["2 failed", "see reports", ""]));
    expect(out).toContain("2 failed");
    expect(out).toContain("see reports");
  });
});
