import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AtlasOptions } from "./assets/atlas.js";
import type { LaunchConfig } from "./launch.js";
import { TOOLING_API_VERSION, type ToolingPlugin } from "./plugin.js";

/** Contents of `debuff.config.ts`. */
export interface DebuffConfig {
  plugins?: ToolingPlugin[];
  assets?: {
    /** Atlas packing for PNG images (default on). `false` disables it. */
    atlas?: AtlasOptions | false;
  };
  scenarios?: {
    /**
     * Browser viewport for scenarios and fuzzing, `[width, height]` in CSS pixels. Default `[960, 540]`.
     * Set it to your game's shape, e.g. `[360, 640]` for a portrait game, so captures and contrast checks
     * see the game at full size. A scenario's own `viewport` wins.
     */
    viewport?: [number, number];
  };
  /**
   * Launch metadata: `debuff build` turns it into link-preview tags, a web app manifest and a preview
   * image, and `debuff ship` uses it for store checks and the press kit. Defaults come from package.json.
   */
  launch?: LaunchConfig;
  /**
   * Type-check with the project's `tsc` while `debuff dev` runs and show type errors in the dev tools
   * overlay and to agents (`game_errors`). Default false.
   */
  typecheck?: boolean;
}

export interface ResolvedConfig {
  root: string;
  /** Absolute path of the loaded config file, if any. */
  file: string | undefined;
  plugins: ToolingPlugin[];
  atlas: AtlasOptions | false;
  /** `scenarios.viewport`, when set. */
  viewport?: [number, number];
  launch: LaunchConfig;
  typecheck: boolean;
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
  if (!file) return { root, file: undefined, plugins: [], atlas: {}, launch: {}, typecheck: false };
  // Vite's module runner transpiles TypeScript without a separate loader dependency.
  const { runnerImport } = await import("vite");
  // runnerImport sets process.env.NODE_ENV to "development" for the whole process. Put it back, or a
  // `debuff build` that loaded a config would build in dev mode and ship the dev tools to players.
  const nodeEnv = process.env.NODE_ENV;
  let module: { default?: DebuffConfig };
  try {
    ({ module } = await runnerImport<{ default?: DebuffConfig }>(file));
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
  }
  const config = module.default;
  if (!config || typeof config !== "object") throw new Error(`${file} must \`export default defineConfig({ ... })\``);
  const viewport = config.scenarios?.viewport;
  if (viewport !== undefined) checkViewport(viewport, `${file}: scenarios.viewport`);
  return {
    root,
    file,
    plugins: validatePlugins(config.plugins ?? [], file),
    atlas: config.assets?.atlas ?? {},
    launch: config.launch ?? {},
    typecheck: config.typecheck === true,
    ...(viewport ? { viewport } : {}),
  };
}

/** A browser viewport `[width, height]`: whole CSS pixels from 100 to 4096. Throws a readable error otherwise. */
export function checkViewport(value: unknown, where: string): asserts value is [number, number] {
  const ok =
    Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n) && (n as number) >= 100 && (n as number) <= 4096);
  if (!ok) throw new Error(`${where} must be [width, height] in whole CSS pixels from 100 to 4096, got ${JSON.stringify(value)}`);
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
    for (const kind of ["commands", "scenarioSteps"] as const) {
      for (const def of plugin[kind] ?? []) {
        if (!def || typeof def.name !== "string" || !NAME.test(def.name) || typeof def.run !== "function") {
          throw new Error(`Plugin "${plugin.name}": every entry in ${kind} needs a kebab-case name and a run() function`);
        }
      }
    }
    for (const importer of plugin.assets ?? []) {
      const ok = importer?.extensions?.length && ("import" in importer || ("command" in importer && importer.command?.length));
      if (!ok) throw new Error(`Plugin "${plugin.name}": importer "${importer?.name}" needs extensions and either import() or command`);
    }
    return plugin as ToolingPlugin;
  });
}
