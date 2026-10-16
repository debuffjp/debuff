import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InlineConfig, ViteDevServer } from "vite";
import { debuff } from "./vite-plugin.js";

const CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];

/** Vite config for a Debuff project. A project's own vite.config is respected if present. */
export function viteConfig(root: string, extra: InlineConfig = {}): InlineConfig {
  const hasConfig = CONFIG_FILES.some((f) => existsSync(join(root, f)));
  return { root, ...(hasConfig ? {} : { configFile: false }), plugins: [debuff()], ...extra };
}

export async function createDevServer(
  root: string,
  options: { port?: number; host?: boolean; logLevel?: InlineConfig["logLevel"] } = {},
): Promise<ViteDevServer> {
  const { createServer } = await import("vite");
  return createServer(
    viteConfig(root, {
      ...(options.logLevel ? { logLevel: options.logLevel } : {}),
      server: { port: options.port ?? 5173, strictPort: false, host: options.host ?? false },
    }),
  );
}
