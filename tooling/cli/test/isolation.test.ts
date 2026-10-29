import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
import { writeHeadersFile } from "../src/isolation.js";
import { ship } from "../src/ship.js";
import { viteConfig } from "../src/vite.js";

let root: string;
const env = { DEBUFF_TELEMETRY: "off", DEBUFF_UPDATE_CHECK: "0" };

function project(config?: string) {
  root = mkdtempSync(join(tmpdir(), "debuff-isolation-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "jelly" }));
  if (config !== undefined) writeFileSync(join(root, "debuff.config.mjs"), `export default ${config};`);
  return root;
}

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("isolation config", () => {
  it("is off by default, and true means require-corp", async () => {
    expect((await loadConfig(project())).isolation).toBeNull();
    expect((await loadConfig(project("{ isolation: true }"))).isolation).toEqual({ embed: "require-corp" });
    expect((await loadConfig(project('{ isolation: { embed: "credentialless" } }'))).isolation).toEqual({ embed: "credentialless" });
  });

  it("rejects an unknown embed mode", async () => {
    await expect(loadConfig(project('{ isolation: { embed: "none" } }'))).rejects.toMatchObject({ code: "config_invalid" });
  });

  it("sends the headers from the dev and preview servers, keeping the server's own options", async () => {
    const config = await loadConfig(project("{ isolation: true }"));
    const vite = await viteConfig(root, { server: { port: 5199 } }, config);
    expect(vite.server).toMatchObject({
      port: 5199,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
    expect(vite.preview?.headers).toMatchObject({ "Cross-Origin-Embedder-Policy": "require-corp" });
    const off = await viteConfig(root, { server: { port: 5199 } }, await loadConfig(project()));
    expect(off.server?.headers).toBeUndefined();
  });
});

describe("writeHeadersFile", () => {
  it("writes dist/_headers, appends to a project's own and leaves one that already isolates", () => {
    project();
    const dist = join(root, "dist");
    mkdirSync(dist);
    expect(writeHeadersFile(dist, "require-corp")).toBe(join(dist, "_headers"));
    expect(readFileSync(join(dist, "_headers"), "utf8")).toBe(
      "/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  Cross-Origin-Resource-Policy: same-origin\n",
    );

    writeFileSync(join(dist, "_headers"), "/assets/*\n  Cache-Control: max-age=31536000\n");
    writeHeadersFile(dist, "credentialless");
    const merged = readFileSync(join(dist, "_headers"), "utf8");
    expect(merged.startsWith("/assets/*\n  Cache-Control: max-age=31536000\n\n/*\n")).toBe(true);
    expect(merged).toContain("Cross-Origin-Embedder-Policy: credentialless");

    expect(writeHeadersFile(dist, "require-corp")).toBeNull();
    expect(readFileSync(join(dist, "_headers"), "utf8")).toBe(merged);
  });
});

describe("isolation in doctor and ship", () => {
  it("doctor warns about files index.html loads from other sites", async () => {
    project("{ isolation: true }");
    writeFileSync(join(root, "index.html"), '<script src="https://cdn.example.com/a.js"></script><script src="./main.ts"></script>');
    const warned = (await runDoctor(root, { browser: false, env })).checks.find((c) => c.id === "isolation");
    expect(warned).toMatchObject({ ok: false, required: false });
    expect(warned?.message).toContain("https://cdn.example.com/a.js");

    writeFileSync(join(root, "index.html"), '<script src="./main.ts"></script>');
    expect((await runDoctor(root, { browser: false, env })).checks.find((c) => c.id === "isolation")?.ok).toBe(true);
  });

  it("ship itch tells you to tick SharedArrayBuffer support when isolation is on", () => {
    project();
    mkdirSync(join(root, "dist", "assets"), { recursive: true });
    writeFileSync(join(root, "dist", "index.html"), '<html><body><script src="./assets/a.js"></script></body></html>');
    writeFileSync(join(root, "dist", "assets", "a.js"), "console.log(1)");
    expect(ship(root, "itch").next.join(" ")).not.toContain("SharedArrayBuffer");
    expect(ship(root, "itch", {}, true).next.join(" ")).toContain("SharedArrayBuffer support");
  });
});
