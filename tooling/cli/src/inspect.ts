import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileAssets, findUnused } from "./assets/index.js";
import { loadConfig } from "./config.js";
import { buildReport } from "./report.js";

const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

/** JSON summary of a debuff project for agents and tools (`debuff inspect`, MCP `inspect_project`). */
export async function inspectProject(root: string) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  const config = await loadConfig(root);
  const { manifest, warnings } = await compileAssets(root, { plugins: config.plugins, atlas: config.atlas });
  const dist = join(root, "dist");
  return {
    name: pkg.name,
    debuff: version,
    dependencies: pkg.dependencies ?? {},
    config: config.file ?? null,
    plugins: config.plugins.map((pl) => ({
      name: pl.name,
      apiVersion: pl.apiVersion,
      importers: (pl.assets ?? []).map((i) => ({ name: i.name, extensions: i.extensions, kind: "command" in i ? "command" : "function" })),
      commands: (pl.commands ?? []).map((c) => `${pl.name}:${c.name}`),
      scenarioSteps: (pl.scenarioSteps ?? []).map((s) => `${pl.name}:${s.name}`),
      vite: Boolean(pl.vite),
    })),
    assets: {
      count: Object.keys(manifest.assets).length,
      bytes: Object.values(manifest.assets).reduce((n, a) => n + a.bytes, 0),
      byId: manifest.assets,
      unused: findUnused(root, manifest),
      warnings,
    },
    build: existsSync(dist) ? { totals: buildReport(dist).totals } : null,
    runtime: "Live params and scene state: window.__DEBUFF_DEV__ in the dev server, `debuff scenario`, or the debuff MCP game_* tools.",
  };
}
