import { describe, expect, it } from "vitest";
import { postIntent, xWeight } from "../src/index.js";

const params = (url: string) => new URL(url).searchParams;

describe("postIntent", () => {
  it("drafts an X post with text and url as separate parameters", () => {
    const url = postIntent({ text: "Rope physics are in #gamedev", url: "https://me.itch.io/game?a=1&b=2" });
    expect(url.startsWith("https://x.com/intent/post?")).toBe(true);
    expect(params(url).get("text")).toBe("Rope physics are in #gamedev");
    expect(params(url).get("url")).toBe("https://me.itch.io/game?a=1&b=2");
  });

  it("leaves out what isn't given", () => {
    expect(postIntent({ url: "https://a.test/" })).toBe("https://x.com/intent/post?url=https%3A%2F%2Fa.test%2F");
    expect(postIntent({ text: "hi" })).toBe("https://x.com/intent/post?text=hi");
  });

  it("cuts X text to fit 280 weighted characters, with the link counted as 23", () => {
    const text = params(postIntent({ text: "a".repeat(400), url: `https://a.test/${"x".repeat(100)}` })).get("text") ?? "";
    expect(text.endsWith("…")).toBe(true);
    expect(xWeight(text) + 24).toBeLessThanOrEqual(280);
    expect(xWeight(text) + 24).toBeGreaterThan(275);
  });

  it("weights CJK and emoji as 2 on X", () => {
    expect(xWeight("abc")).toBe(3);
    expect(xWeight("スライム")).toBe(8);
    expect(xWeight("🎮")).toBe(2);
    const text = params(postIntent({ text: "あ".repeat(200) })).get("text") ?? "";
    expect(xWeight(text)).toBeLessThanOrEqual(280);
  });

  it("keeps short text whole", () => {
    expect(params(postIntent({ text: "short", url: "https://a.test/" })).get("text")).toBe("short");
  });

  it("drafts a Bluesky post with the link in the text, cut to 300 graphemes", () => {
    const url = postIntent({ text: "New level", url: "https://a.test/" }, "bluesky");
    expect(url).toBe(`https://bsky.app/intent/compose?text=${encodeURIComponent("New level https://a.test/")}`);
    const long = params(postIntent({ text: "👍🏽".repeat(400), url: "https://a.test/" }, "bluesky")).get("text") ?? "";
    expect(long.endsWith(" https://a.test/")).toBe(true);
    const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(long)];
    expect(segments.length).toBeLessThanOrEqual(300);
    // A skin-tone emoji is never split from its modifier.
    expect(long).not.toMatch(/👍(?!🏽)/u);
  });
});
