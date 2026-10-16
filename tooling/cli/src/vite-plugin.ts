import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { Plugin, PluginOption } from "vite";
import { type CompileResult, compileAssets } from "./assets/compile.js";
import type { ToolingPlugin } from "./plugin.js";

export const ASSETS_DIR = "assets";
const URL_PREFIX = `/${ASSETS_DIR}/`;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".json": "application/json",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".txt": "text/plain; charset=utf-8",
};

export interface DebuffViteOptions {
  plugins?: ToolingPlugin[];
}

/**
 * Serves `<root>/assets/` through the asset pipeline: `/assets/manifest.json` and every file the
 * manifest references, in dev from memory and in builds as emitted files. Files the manifest doesn't
 * reference are not served or shipped.
 */
export function debuff(options: DebuffViteOptions = {}): PluginOption[] {
  let root = process.cwd();
  let current: Promise<CompileResult> | undefined;
  const compile = () => {
    current = compileAssets(root, { plugins: options.plugins ?? [] }).then((r) => {
      for (const w of r.warnings) console.warn(`[debuff] ${w}`);
      return r;
    });
    return current;
  };
  const latest = () => current ?? compile();

  /** Bytes for a URL path under /assets/, or undefined if the manifest doesn't reference it. */
  const read = (r: CompileResult, rel: string): Buffer | undefined => {
    if (rel === "manifest.json") return Buffer.from(`${JSON.stringify(r.manifest, null, 2)}\n`);
    const generated = r.outputs.get(rel);
    if (generated) return generated;
    const referenced = Object.values(r.manifest.assets).some((a) => a.src === `${ASSETS_DIR}/${rel}`);
    const file = resolve(root, ASSETS_DIR, rel);
    const inside = file.startsWith(resolve(root, ASSETS_DIR) + sep);
    return referenced && inside && existsSync(file) ? readFileSync(file) : undefined;
  };

  const core: Plugin = {
    name: "debuff",
    configResolved(config) {
      root = config.root;
    },
    buildStart() {
      compile();
    },
    configureServer(server) {
      const dir = join(root, ASSETS_DIR);
      server.watcher.add(dir);
      const onChange = (file: string) => {
        if (!file.startsWith(dir)) return;
        compile().then(() => server.ws.send({ type: "full-reload" }));
      };
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
      server.watcher.on("change", onChange);
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url?.startsWith(URL_PREFIX)) return next();
        const rel = decodeURIComponent(url.slice(URL_PREFIX.length));
        const body = read(await latest(), rel);
        if (!body) {
          res.statusCode = 404;
          res.end(`[debuff] ${rel} is not in the asset manifest. Run \`debuff assets\` to see what was imported.`);
          return;
        }
        res.setHeader("Content-Type", MIME[extname(rel).toLowerCase()] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.end(body);
      });
    },
    async generateBundle() {
      const r = await latest();
      const files = new Set(["manifest.json", ...r.outputs.keys()]);
      for (const a of Object.values(r.manifest.assets)) files.add(a.src.slice(ASSETS_DIR.length + 1));
      for (const rel of files) {
        const source = read(r, rel);
        if (source) this.emitFile({ type: "asset", fileName: `${ASSETS_DIR}/${rel}`, source });
      }
    },
  };
  return [core, ...(options.plugins ?? []).map((p) => p.vite ?? null)];
}
