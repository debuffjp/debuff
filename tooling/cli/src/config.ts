import { existsSync } from "node:fs";
import { join } from "node:path";
import { TOOLING_API_VERSION, type ToolingPlugin } from "./plugin.js";

/** Contents of `debuff.config.ts`. */
export interface DebuffConfig {
  plugins?: ToolingPlugin[];
}

export interface ResolvedConfig {
  root: string;
  /** Absolute path of the loaded config file, if any. */
  file: string | undefined;
  plugins: ToolingPlugin[];
}

/** Identity helper that gives `debuff.config.ts` full type checking and editor completion. */
export function defineConfig(config: DebuffConfig): DebuffConfig {
  return config;
}

export const CONFIG_FILES = ["debuff.config.ts", "debuff.config.mts", "debuff.config.js", "debuff.config.mjs"];

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Load and validate `debuff.config.*` from `root`. A missing file is a valid empty config. */
export async function loadConfig(root: string): Promise<ResolvedConfig> {
  const file = CONFIG_FILES.map((f) => join(root, f)).find((f) => existsSync(f));
  if (!file) return { root, file: undefined, plugins: [] };
  // Vite's module runner transpiles TypeScript without a separate loader dependency.
  const { runnerImport } = await import("vite");
  const { module } = await runnerImport<{ default?: DebuffConfig }>(file);
  const config = module.default;
  if (!config || typeof config !== "object") throw new Error(`${file} must \`export default defineConfig({ ... })\``);
  return { root, file, plugins: validatePlugins(config.plugins ?? [], file) };
}

export function validatePlugins(plugins: unknown[], source = "config"): ToolingPlugin[] {
  const seen = new Set<string>();
  return plugins.map((p, i) => {
    const plugin = p as Partial<ToolingPlugin>;
    const where = `${source}: plugins[${i}]`;
    if (!plugin || typeof plugin !== "object")
      throw new Error(`${where} is not a plugin object. Did you forget to call the plugin factory?`);
    if (typeof plugin.name !== "string" || !NAME.test(plugin.name)) throw new Error(`${where} needs a kebab-case "name"`);
    if (plugin.apiVersion !== TOOLING_API_VERSION) {
      throw new Error(`Plugin "${plugin.name}" targets apiVersion ${plugin.apiVersion}; this CLI supports ${TOOLING_API_VERSION}`);
    }
    if (seen.has(plugin.name)) throw new Error(`Plugin "${plugin.name}" is listed twice`);
    seen.add(plugin.name);
    for (const importer of plugin.assets ?? []) {
      const ok = importer?.extensions?.length && ("import" in importer || ("command" in importer && importer.command?.length));
      if (!ok) throw new Error(`Plugin "${plugin.name}": importer "${importer?.name}" needs extensions and either import() or command`);
    }
    return plugin as ToolingPlugin;
  });
}
