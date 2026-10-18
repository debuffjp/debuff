import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { debuff, inspectProject, viteConfig } from "../src/index.js";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "debuff-vite-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const corePlugin = (root: string) => {
  const plugin = (debuff() as Plugin[])[0] as Plugin & Record<string, (...args: unknown[]) => unknown>;
  plugin.configResolved({ root });
  return plugin;
};

describe("debuff Vite plugin", () => {
  // The fixtures include unsupported and broken files on purpose: assert on the warnings instead of printing them.
  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("emits only the manifest and the files it references", async () => {
    const root = project({ "assets/hero.png": "png", "assets/notes.psd": "x", "assets/data.json": "{}" });
    const plugin = corePlugin(root);
    plugin.buildStart();
    const emitted: { fileName: string; source: Buffer }[] = [];
    await plugin.generateBundle.call({ emitFile: (f: { fileName: string; source: Buffer }) => emitted.push(f) });
    expect(emitted.map((e) => e.fileName).sort()).toEqual(["assets/data.json", "assets/hero.png", "assets/manifest.json"]);
    const manifest = JSON.parse(String(emitted.find((e) => e.fileName === "assets/manifest.json")?.source));
    expect(Object.keys(manifest.assets).sort()).toEqual(["data", "hero"]);
  });

  it("preloads the manifest and default-group images in the HTML", async () => {
    const root = project({ "assets/hero.png": "png", "assets/level2/boss.png": "png" });
    const plugin = corePlugin(root);
    const tags = (await plugin.transformIndexHtml()) as { attrs: Record<string, string> }[];
    expect(tags.map((t) => [t.attrs.href, t.attrs.as])).toEqual([
      ["assets/manifest.json", "fetch"],
      ["assets/hero.png", "image"],
    ]);
  });

  it("adds the state-preserving reload client in dev only", async () => {
    const root = project({});
    const build = corePlugin(root);
    expect(((await build.transformIndexHtml()) as { tag: string }[]).some((t) => t.tag === "script")).toBe(false);
    expect(build.load("/@debuff/reload.js")).toBeUndefined();

    const dev = (debuff() as Plugin[])[0] as Plugin & Record<string, (...args: unknown[]) => unknown>;
    dev.configResolved({ root, command: "serve" });
    const tags = (await dev.transformIndexHtml()) as { tag: string; attrs: Record<string, string> }[];
    expect(tags[0]).toMatchObject({ tag: "script", attrs: { type: "module", src: "/@debuff/reload.js" } });
    expect(dev.resolveId("/@debuff/reload.js")).toBe("/@debuff/reload.js");
    expect(String(dev.load("/@debuff/reload.js"))).toContain("vite:beforeFullReload");
  });

  it("serves the manifest and referenced files in dev, and 404s everything else", async () => {
    const root = project({ "assets/hero.png": "png", "assets/secret.psd": "x" });
    const plugin = corePlugin(root);
    let middleware: (req: { url: string }, res: Record<string, unknown>, next: () => void) => Promise<void> = async () => {};
    const server = {
      watcher: { add: vi.fn(), on: vi.fn() },
      ws: { send: vi.fn() },
      middlewares: { use: (fn: typeof middleware) => (middleware = fn) },
    };
    plugin.configureServer(server);
    const request = async (url: string) => {
      const res = { statusCode: 200, headers: {} as Record<string, string>, body: "" as unknown };
      const response = { ...res, setHeader: (k: string, v: string) => (res.headers[k] = v), end: (b: unknown) => (res.body = b) };
      let passed = false;
      await middleware({ url }, response as never, () => {
        passed = true;
      });
      return { ...res, statusCode: (response as { statusCode: number }).statusCode, passed };
    };
    const manifest = await request("/assets/manifest.json");
    expect(JSON.parse(String(manifest.body)).assets.hero.src).toBe("assets/hero.png");
    expect((await request("/assets/hero.png")).headers["Content-Type"]).toBe("image/png");
    expect((await request("/assets/secret.psd")).statusCode).toBe(404);
    expect((await request("/assets/../package.json")).statusCode).toBe(404);
    expect((await request("/src/main.ts")).passed).toBe(true);
  });
});

describe("viteConfig and inspectProject", () => {
  it("disables config files unless the project has one", async () => {
    const plain = project({ "package.json": '{"name":"plain"}' });
    expect((await viteConfig(plain)).configFile).toBe(false);
    const custom = project({ "package.json": "{}", "vite.config.ts": "export default {}" });
    expect((await viteConfig(custom)).configFile).toBeUndefined();
  });

  it("summarises a project", async () => {
    const root = project({
      "package.json": '{"name":"game","dependencies":{"@debuffjp/core":"0.1.0"}}',
      "assets/a.txt": "a",
      "src/main.ts": '"a"',
    });
    const info = await inspectProject(root);
    expect(info).toMatchObject({ name: "game", config: null, plugins: [], build: null });
    expect(info.assets).toMatchObject({ count: 1, unused: [] });
  });
});
