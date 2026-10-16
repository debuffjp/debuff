import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InlineConfig, ViteDevServer } from "vite";
import { loadConfig, type ResolvedConfig } from "./config.js";
import { debuff } from "./vite-plugin.js";

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];

/** Vite config for a Debuff project: loads `debuff.config.ts` and respects a project's own vite.config. */
export async function viteConfig(root: string, extra: InlineConfig = {}, config?: ResolvedConfig): Promise<InlineConfig> {
  const resolved = config ?? (await loadConfig(root));
  const hasViteConfig = VITE_CONFIG_FILES.some((f) => existsSync(join(root, f)));
  return { root, ...(hasViteConfig ? {} : { configFile: false }), plugins: debuff({ plugins: resolved.plugins }), ...extra };
}

export async function createDevServer(
  root: string,
  options: { port?: number; host?: boolean; logLevel?: InlineConfig["logLevel"] } = {},
): Promise<ViteDevServer> {
  const { createServer } = await import("vite");
  return createServer(
    await viteConfig(root, {
      ...(options.logLevel ? { logLevel: options.logLevel } : {}),
      server: { port: options.port ?? 5173, strictPort: false, host: options.host ?? false },
    }),
  );
}
