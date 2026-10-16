import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetError, type AssetManifest, Assets } from "../src/index.js";

const manifest: AssetManifest = {
  version: 1,
  assets: {
    config: { type: "json", src: "assets/config.json" },
    "level1/map": { type: "json", src: "assets/level1/map.json", group: "level1" },
    notes: { type: "text", src: "assets/notes.txt" },
  },
};

function stubFetch(status = 200) {
  const fetch = vi.fn(async (url: string) => ({
    ok: status === 200,
    status,
    json: async () => ({ url }),
    text: async () => `text:${url}`,
    arrayBuffer: async () => new ArrayBuffer(4),
  }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("Assets", () => {
  it("loads a group and reports progress", async () => {
    const fetch = stubFetch();
    const assets = new Assets(manifest, "/base/");
    const progress: number[] = [];
    await assets.load("default", (p) => progress.push(p.loaded));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(assets.json("config")).toEqual({ url: "/base/assets/config.json" });
    expect(assets.text("notes")).toBe("text:/base/assets/notes.txt");
    expect(progress.at(-1)).toBe(2);
    expect(assets.has("level1/map")).toBe(false);
  });

  it("shares concurrent requests", async () => {
    const fetch = stubFetch();
    const assets = new Assets(manifest);
    await Promise.all([assets.fetch("config"), assets.fetch("config")]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives actionable errors", async () => {
    stubFetch(404);
    const assets = new Assets(manifest);
    expect(() => assets.json("level1/map")).toThrow(/not loaded yet. Load its group "level1" first/);
    expect(() => assets.image("config")).toThrow(/is json, not image/);
    expect(() => assets.entry("conf")).toThrow(/Did you mean: config/);
    await expect(assets.fetch("config")).rejects.toThrow(AssetError);
    await expect(assets.fetch("config")).rejects.toThrow(/HTTP 404/);
  });
});

describe("atlas frames", () => {
  const atlased: AssetManifest = {
    version: 1,
    assets: {
      hero: {
        type: "image",
        src: "assets/_atlas/default-0.png",
        rect: { x: 10, y: 20, w: 32, h: 16 },
        grid: { frameWidth: 16, frameHeight: 16 },
      },
      coin: { type: "image", src: "assets/_atlas/default-0.png", rect: { x: 50, y: 2, w: 8, h: 8 } },
      bg: { type: "image", src: "assets/bg.png" },
    },
  };

  it("shares one request per atlas and slices frames inside the rect", async () => {
    const loads: string[] = [];
    class FakeImage {
      src = "";
      naturalWidth = 64;
      naturalHeight = 48;
      width = 64;
      height = 48;
      async decode() {
        loads.push(this.src);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const assets = new Assets(atlased);
    await assets.load();
    expect(loads).toEqual(["assets/_atlas/default-0.png", "assets/bg.png"]);
    expect(assets.frame("coin")).toMatchObject({ x: 50, y: 2, w: 8, h: 8 });
    expect(assets.frame("bg")).toMatchObject({ x: 0, y: 0, w: 64, h: 48 });
    expect(assets.frames("hero").map((f) => [f.x, f.y])).toEqual([
      [10, 20],
      [26, 20],
    ]);
    expect(assets.frame("hero").image).toBe(assets.frame("coin").image);
    expect(() => assets.image("hero")).toThrow(/packed into an atlas. Use assets.frame/);
  });
});
