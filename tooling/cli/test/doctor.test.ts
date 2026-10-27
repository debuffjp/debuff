import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type DoctorResult, runDoctor } from "../src/index.js";

const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
const env = { DEBUFF_TELEMETRY: "off" };
let root: string;

function install(dir: string, name: string, v: string) {
  mkdirSync(join(dir, "node_modules", name), { recursive: true });
  writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, version: v }));
}

/** A project with core and dev declared at `declared` and installed at `installedAs`, plus agent files. */
function project({ declared = version, installedAs = declared } = {}) {
  root = mkdtempSync(join(tmpdir(), "debuff-doctor-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "jelly", dependencies: { "@debuffjp/core": declared }, devDependencies: { "@debuffjp/dev": declared } }),
  );
  install(root, "@debuffjp/core", installedAs);
  install(root, "@debuffjp/dev", installedAs);
  writeFileSync(join(root, "AGENTS.md"), "# Agent guide\n");
  writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
  writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { debuff: { command: "npx", args: ["-y", "@debuffjp/mcp"] } } }));
  return root;
}

const check = (r: DoctorResult, id: string) => r.checks.find((c) => c.id === id);
const failed = (r: DoctorResult) => r.checks.filter((c) => !c.ok).map((c) => c.id);

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("runDoctor", () => {
  it("passes a healthy project", async () => {
    const r = await runDoctor(project(), { browser: false, env });
    expect(failed(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(check(r, "debuff-versions")?.message).toBe(`debuff packages all at ${version}`);
    expect(check(r, "telemetry")).toMatchObject({ ok: true, required: false, message: "Telemetry is off (DEBUFF_TELEMETRY is off)" });
  });

  it("fails when debuff packages are at another version than the CLI", async () => {
    const r = await runDoctor(project({ declared: "0.1.0" }), { browser: false, env });
    expect(r.ok).toBe(false);
    expect(check(r, "debuff-versions")).toMatchObject({ ok: false, message: expect.stringContaining("@debuffjp/core is 0.1.0") });
    expect(check(r, "debuff-versions")?.fix).toContain(version);
  });

  it("reads a package.json saved with a byte order mark", async () => {
    project();
    writeFileSync(join(root, "package.json"), `﻿${readFileSync(join(root, "package.json"), "utf8")}`);
    expect(check(await runDoctor(root, { browser: false, env }), "package-json")?.ok).toBe(true);
  });

  it("fails when node_modules is missing or out of date", async () => {
    project({ installedAs: "0.1.0" });
    let r = await runDoctor(root, { browser: false, env });
    expect(check(r, "installed")).toMatchObject({ ok: false, fix: "npm install" });
    expect(check(r, "installed")?.message).toContain(`@debuffjp/core 0.1.0 (wants ${version})`);
    rmSync(join(root, "node_modules"), { recursive: true });
    r = await runDoctor(root, { browser: false, env });
    expect(check(r, "installed")?.message).toBe("Not installed: @debuffjp/core, @debuffjp/dev");
  });

  it("warns about a nested copy of core without failing", async () => {
    project();
    install(join(root, "node_modules", "@debuffjp", "dev"), "@debuffjp/core", version);
    const r = await runDoctor(root, { browser: false, env });
    expect(check(r, "duplicate-core")).toMatchObject({ ok: false, required: false, fix: "npm dedupe" });
    expect(r.ok).toBe(true);
  });

  it("needs @debuffjp/dev, and TypeScript when a script runs tsc", async () => {
    root = mkdtempSync(join(tmpdir(), "debuff-doctor-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { build: "tsc --noEmit && debuff build" } }));
    const r = await runDoctor(root, { browser: false, env });
    expect(failed(r)).toEqual(expect.arrayContaining(["dev-hooks-package", "typescript"]));
    expect(check(r, "dev-hooks-package")?.fix).toBe(`npm i -D @debuffjp/dev@${version}`);
  });

  it("reports every problem at once instead of stopping at the first", async () => {
    root = mkdtempSync(join(tmpdir(), "debuff-doctor-"));
    writeFileSync(join(root, "debuff.config.mjs"), "export const nothing = 1;\n");
    writeFileSync(join(root, "saves.json"), "{ nope");
    const r = await runDoctor(root, { browser: false, env: { ...env, NODE_ENV: "production" } });
    expect(failed(r)).toEqual(["node-env", "package-json", "config", "saves", "agent-files"]);
    expect(check(r, "config")?.message).toContain("must `export default defineConfig({ ... })`");
    expect(check(r, "node-env")).toMatchObject({ required: false, message: expect.stringContaining("NODE_ENV=production") });
  });

  it("flags missing agent files as advice", async () => {
    project();
    rmSync(join(root, ".mcp.json"));
    rmSync(join(root, "CLAUDE.md"));
    const r = await runDoctor(root, { browser: false, env });
    expect(check(r, "agent-files")).toMatchObject({
      ok: false,
      required: false,
      message: "AI agents lack project context: missing CLAUDE.md, .mcp.json with the debuff server",
    });
    expect(r.ok).toBe(true);
  });
});
