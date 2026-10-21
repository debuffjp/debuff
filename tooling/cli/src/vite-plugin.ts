import { existsSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import type { Plugin, PluginOption } from "vite";
import { attachAgentLink } from "./agent-link.js";
import type { AtlasOptions } from "./assets/atlas.js";
import { type CompileResult, compileAssets } from "./assets/compile.js";
import type { ToolingPlugin } from "./plugin.js";
import { findSaves, type SavesFound, writeSavesFound } from "./saves.js";
import { createTypeChecker } from "./typecheck.js";

export const ASSETS_DIR = "assets";
const URL_PREFIX = `/${ASSETS_DIR}/`;

/**
 * Dev-only client script: just before Vite reloads the page for a code change, ask the dev tools to save
 * the session so the new code can replay it to the same tick (state-preserving reload, `@debuffjp/dev`).
 */
const RELOAD_CLIENT = "/@debuff/reload.js";
const RELOAD_CLIENT_CODE = `if (import.meta.hot) {
  import.meta.hot.on("vite:beforeFullReload", () => {
    try {
      window.__DEBUFF_DEV__?.keepForReload?.();
    } catch (err) {
      console.warn("[debuff] couldn't keep your place across the reload", err);
    }
  });
  // Type errors from the dev server's checker, for the dev tools overlay (\`typecheck\` in debuff.config).
  import.meta.hot.on("debuff:types", (result) => {
    window.__DEBUFF_TYPES__ = result;
    dispatchEvent(new CustomEvent("debuff:types", { detail: result }));
  });
  import.meta.hot.send("debuff:types-request");
}
`;

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
  /** Atlas packing options; `false` disables. Default on. */
  atlas?: AtlasOptions | false;
  /** Relay agent commands to the game open in the browser (`debuff dev` turns this on). Default false. */
  agentLink?: boolean;
  /** Type-check with the project's `tsc` while serving and show type errors in the dev tools. Default false. */
  typecheck?: boolean;
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
    current = compileAssets(root, {
      plugins: options.plugins ?? [],
      ...(options.atlas === undefined ? {} : { atlas: options.atlas }),
    }).then((r) => {
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

  let serving = false;
  /** Saves per module in this build (ADR 0014); `debuff build` compares them with saves.json. */
  const saves = new Map<string, SavesFound>();
  const core: Plugin = {
    name: "debuff",
    configResolved(config) {
      root = config.root;
      serving = config.command === "serve";
    },
    resolveId(id) {
      return serving && id === RELOAD_CLIENT ? id : undefined;
    },
    load(id) {
      return serving && id === RELOAD_CLIENT ? RELOAD_CLIENT_CODE : undefined;
    },
    buildStart() {
      compile();
      saves.clear();
    },
    transform(code, id) {
      if (serving || id.includes("/node_modules/") || !/\.[cm]?[jt]sx?$/.test(id.split("?")[0] ?? "")) return;
      if (!code.includes("@debuffjp/core") || !code.includes("Storage")) return;
      const file = relative(root, id.split("?")[0] ?? id).replaceAll("\\", "/");
      try {
        saves.set(id, findSaves(this.parse(code), file));
      } catch {
        // Not parseable as JavaScript here (another plugin's virtual module); nothing to record.
      }
    },
    buildEnd() {
      if (serving) return;
      const all: SavesFound = { saves: [], unchecked: [] };
      for (const f of saves.values()) {
        all.saves.push(...f.saves);
        all.unchecked.push(...f.unchecked);
      }
      writeSavesFound(root, all);
    },
    configureServer(server) {
      const dir = join(root, ASSETS_DIR);
      server.watcher.add(dir);
      // chokidar may report either separator on Windows, so normalise before the prefix check.
      const prefix = `${dir.replaceAll("\\", "/").replace(/\/$/, "")}/`;
      const onChange = (file: string) => {
        if (!file.replaceAll("\\", "/").startsWith(prefix)) return;
        compile().then(() => server.ws.send({ type: "full-reload" }));
      };
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
      server.watcher.on("change", onChange);
      if (options.agentLink) attachAgentLink(server, root);
      if (options.typecheck) {
        let shown = -1;
        const checker = createTypeChecker(root, (r) => {
          if (!r.ok) return console.warn(`[debuff] type-checking is off: ${r.reason}`);
          server.ws.send({ type: "custom", event: "debuff:types", data: r });
          const n = r.diagnostics.length;
          if (n !== shown)
            console.log(n ? `[debuff] ${n} type error${n === 1 ? "" : "s"} (${r.ms} ms)` : `[debuff] no type errors (${r.ms} ms)`);
          shown = n;
        });
        const onSource = (file: string) => {
          const f = file.replaceAll("\\", "/");
          if (/\.(m|c)?tsx?$/.test(f) && !f.includes("/node_modules/")) checker.schedule();
          else if (f.endsWith("/tsconfig.json")) checker.schedule();
        };
        for (const e of ["add", "unlink", "change"] as const) server.watcher.on(e, onSource);
        server.ws.on("debuff:types-request", (_data, client) => {
          if (checker.latest?.ok) client.send("debuff:types", checker.latest);
        });
        server.httpServer?.once("close", () => checker.dispose());
        checker.schedule();
      }
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url?.startsWith(URL_PREFIX)) return next();
        let rel: string;
        try {
          rel = decodeURIComponent(url.slice(URL_PREFIX.length));
        } catch {
          res.statusCode = 400;
          res.end(`[debuff] ${url} is not a valid URL (malformed percent-encoding).`);
          return;
        }
        return (async () => {
          const body = read(await latest(), rel);
          if (!body) {
            res.statusCode = 404;
            res.end(`[debuff] ${rel} is not in the asset manifest. Run \`debuff assets\` to see what was imported.`);
            return;
          }
          res.setHeader("Content-Type", MIME[extname(rel).toLowerCase()] ?? "application/octet-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.end(body);
        })().catch(next);
      });
    },
    // Preload the manifest and the default group's images so they download alongside the code,
    // instead of only after the game script has run and asked for them.
    async transformIndexHtml() {
      const r = await latest();
      const images = new Set<string>();
      for (const a of Object.values(r.manifest.assets))
        if (a.type === "image" && !a.group) images.add(a.hash ? `${a.src}?v=${a.hash}` : a.src);
      return [
        ...(serving ? [{ tag: "script", attrs: { type: "module", src: RELOAD_CLIENT }, injectTo: "head" as const }] : []),
        {
          tag: "link",
          attrs: { rel: "preload", href: `${ASSETS_DIR}/manifest.json`, as: "fetch", crossorigin: "anonymous" },
          injectTo: "head" as const,
        },
        ...[...images].map((href) => ({ tag: "link", attrs: { rel: "preload", href, as: "image" }, injectTo: "head" as const })),
      ];
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
