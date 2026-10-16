import { join } from "node:path";
import type { Plugin } from "vite";
import { compileAssets } from "./assets.js";

/** Regenerates the asset manifest on start and whenever files under public/assets change. */
export function debuff(): Plugin {
  let root = process.cwd();
  const compile = () => {
    const { warnings } = compileAssets(root);
    for (const w of warnings) console.warn(`[debuff] ${w}`);
  };
  return {
    name: "debuff",
    configResolved(config) {
      root = config.root;
      compile();
    },
    configureServer(server) {
      const dir = join(root, "public", "assets");
      server.watcher.add(dir);
      const onChange = (file: string) => {
        if (file.startsWith(dir) && !file.endsWith("manifest.json")) {
          compile();
          server.ws.send({ type: "full-reload" });
        }
      };
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
      server.watcher.on("change", onChange);
    },
  };
}
