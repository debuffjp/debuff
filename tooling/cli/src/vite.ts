import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InlineConfig, ViteDevServer } from "vite";
import { loadConfig, type ResolvedConfig } from "./config.js";
import { isolationHeaders } from "./isolation.js";
import { debuff } from "./vite-plugin.js";

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];

/** Vite config for a debuff project: loads `debuff.config.ts` and respects a project's own vite.config. */
export async function viteConfig(
  root: string,
  extra: InlineConfig = {},
  config?: ResolvedConfig,
  link: { agentLink?: boolean } = {},
): Promise<InlineConfig> {
  const resolved = config ?? (await loadConfig(root));
  const hasViteConfig = VITE_CONFIG_FILES.some((f) => existsSync(join(root, f)));
  const headers = resolved.isolation ? isolationHeaders(resolved.isolation.embed) : undefined;
  return {
    root,
    // Relative asset URLs, so a build works from any folder (itch.io, GitHub Pages, a /play/ subpath).
    ...(hasViteConfig ? {} : { configFile: false, base: "./" }),
    plugins: debuff({
      plugins: resolved.plugins,
      atlas: resolved.atlas,
      agentLink: link.agentLink ?? false,
      typecheck: resolved.typecheck,
    }),
    ...extra,
    // Merged after `extra`, which may set its own server options (port, host).
    ...(headers
      ? { server: { ...extra.server, headers: { ...headers, ...extra.server?.headers } }, preview: { ...extra.preview, headers } }
      : {}),
  };
}

export async function createDevServer(
  root: string,
  options: { port?: number; host?: boolean; logLevel?: InlineConfig["logLevel"]; agentLink?: boolean } = {},
): Promise<ViteDevServer> {
  const { createServer } = await import("vite");
  return createServer(
    await viteConfig(
      root,
      {
        ...(options.logLevel ? { logLevel: options.logLevel } : {}),
        server: { port: options.port ?? 5173, strictPort: false, host: options.host ?? false },
      },
      undefined,
      { agentLink: options.agentLink ?? false },
    ),
  );
}
