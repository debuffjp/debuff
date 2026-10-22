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

describe("reload", () => {
  it("re-fetches past the cache and tells listeners, once per subscription", async () => {
    const fetch = stubFetch();
    const assets = new Assets(manifest, "/base/");
    await assets.fetch("config");
    const seen: string[] = [];
    const off = assets.onChange("config", (id) => seen.push(id));
    const value = await assets.reload("config");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1]?.[0])).toMatch(/^\/base\/assets\/config\.json\?t=\d+$/);
    expect(value).toEqual(assets.json("config"));
    expect(seen).toEqual(["config"]);
    off();
    await assets.reload("config");
    expect(seen).toEqual(["config"]);
    expect(() => assets.onChange("nope", () => {})).toThrow(/Unknown asset/);
  });

  it("reports a failed reload and keeps the old value", async () => {
    stubFetch();
    const assets = new Assets(manifest);
    await assets.fetch("config");
    stubFetch(500);
    await expect(assets.reload("config")).rejects.toThrow(/Failed to reload asset "config".*HTTP 500/);
    expect(assets.json("config")).toEqual({ url: "assets/config.json" });
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
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 64;
      naturalHeight = 48;
      width = 64;
      height = 48;
      private url = "";
      get src() {
        return this.url;
      }
      set src(value: string) {
        this.url = value;
        loads.push(value);
        queueMicrotask(() => this.onload?.());
      }
      // Simulates browsers that never resolve decode() in background tabs: loading must not wait on it.
      decode() {
        return new Promise<void>(() => {});
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

describe("cache busting", () => {
  it("appends the content hash to asset URLs so redeploys don't mix cached files", async () => {
    const fetch = stubFetch();
    const assets = new Assets({
      version: 1,
      assets: {
        cfg: { type: "json", src: "assets/cfg.json", hash: "abc123" },
        raw: { type: "json", src: "assets/raw.json" },
      },
    });
    expect(assets.url("cfg")).toBe("assets/cfg.json?v=abc123");
    expect(assets.url("raw")).toBe("assets/raw.json");
    await assets.load();
    expect(fetch.mock.calls.map((c) => c[0]).sort()).toEqual(["assets/cfg.json?v=abc123", "assets/raw.json"]);
  });
});
