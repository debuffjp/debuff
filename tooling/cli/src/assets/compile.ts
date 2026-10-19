import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { AssetImporter, CompiledEntry, GeneratedFile, ImportResult, SourceFile, ToolingPlugin } from "../plugin.js";
import { type AtlasOptions, buildAtlases } from "./atlas.js";
import { builtinImporter } from "./builtin.js";
import { runCommandImporter } from "./command.js";

export interface CompiledManifest {
  version: 1;
  assets: Record<string, CompiledEntry>;
}

export interface CompileResult {
  manifest: CompiledManifest;
  /** Generated files keyed by path relative to `assets/`. */
  outputs: Map<string, Buffer>;
  warnings: string[];
  /** Which importer produced each asset id. */
  importedBy: Record<string, string>;
}

const IGNORED = (rel: string) => rel === "manifest.json" || rel.endsWith(".license") || rel.split("/").some((p) => p.startsWith("."));

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** The importer claiming `rel`: the longest matching suffix wins, plugins before built-ins on ties. */
function pick(rel: string, importers: AssetImporter[]): { importer: AssetImporter; ext: string } | undefined {
  const lower = rel.toLowerCase();
  let best: { importer: AssetImporter; ext: string } | undefined;
  for (const importer of importers) {
    for (const ext of importer.extensions) {
      const e = ext.toLowerCase();
      if (lower.endsWith(e) && (!best || e.length > best.ext.length)) best = { importer, ext: e };
    }
  }
  return best;
}

export interface CompileOptions {
  plugins?: ToolingPlugin[];
  /** Cache import results by content hash under `.debuff/cache/assets`. Default true. */
  cache?: boolean;
  /** Pack PNG images into atlases per preload group. Default on; `false` disables. */
  atlas?: AtlasOptions | false;
}

/**
 * Turn `assets/` into a manifest plus generated files, entirely in memory.
 * Source files are never modified; nothing is written into the source tree.
 */
export async function compileAssets(root: string, options: CompileOptions = {}): Promise<CompileResult> {
  const dir = join(root, "assets");
  const importers = [...(options.plugins ?? []).flatMap((p) => p.assets ?? []), builtinImporter];
  const cacheDir = join(root, ".debuff", "cache", "assets");
  const useCache = options.cache ?? true;
  const files = walk(dir)
    .map((path) => ({ path, rel: relative(dir, path).split(sep).join("/") }))
    .filter((f) => !IGNORED(f.rel))
    .sort((a, b) => (a.rel < b.rel ? -1 : 1));

  const warnings: string[] = [];
  const assets: Record<string, CompiledEntry> = {};
  const outputs = new Map<string, Buffer>();
  const importedBy: Record<string, string> = {};
  const consumed = new Set<string>();
  const results: { file: SourceFile; importer: AssetImporter; result: ImportResult }[] = [];

  // Plugin importers run first so they can consume files (e.g. a sheet's PNG) before built-ins see them.
  const ordered = files
    .map((f) => ({ ...f, match: pick(f.rel, importers) }))
    .sort((a, b) => Number(a.match?.importer === builtinImporter) - Number(b.match?.importer === builtinImporter));

  for (const { path, rel, match } of ordered) {
    if (consumed.has(rel)) continue;
    if (!match) {
      warnings.push(`Skipped ${rel}: no importer for this file type`);
      continue;
    }
    const parts = rel.split("/");
    const group = parts.length > 1 ? parts[0] : undefined;
    const base = (parts.at(-1) ?? rel).slice(0, -match.ext.length);
    const file: SourceFile = { path, rel, id: (group ? `${group}/` : "") + base, ext: match.ext, ...(group ? { group } : {}) };

    let result: ImportResult;
    try {
      result = await runImporter(match.importer, file, root, useCache ? cacheDir : undefined);
    } catch (err) {
      warnings.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const c of result.consumes ?? []) consumed.add(c);
    results.push({ file, importer: match.importer, result });
  }

  for (const { file, importer, result } of results) {
    warnings.push(...(result.warnings ?? []).map((w) => (w.includes(file.rel) ? w : `${file.rel}: ${w}`)));
    for (const out of result.outputs ?? []) outputs.set(out.path, toBuffer(out));
    for (const [id, entry] of Object.entries(result.assets)) {
      if (assets[id]) {
        warnings.push(`Duplicate asset id "${id}" from ${file.rel} (${importer.name}); keeping ${assets[id].src}`);
        continue;
      }
      const bytes = bytesOf(entry.src, dir, outputs);
      if (!bytes) {
        warnings.push(`${importer.name}: asset "${id}" points at ${entry.src}, which is neither a source file nor a generated output`);
        continue;
      }
      assets[id] = { ...entry, bytes: bytes.length, hash: sha(bytes).slice(0, 12) };
      importedBy[id] = importer.name;
    }
  }

  if (options.atlas !== false)
    packAtlases(
      dir,
      assets,
      importedBy,
      outputs,
      options.atlas ?? {},
      useCache ? join(root, ".debuff", "cache", "atlas") : undefined,
      warnings,
    );

  const sorted = Object.fromEntries(Object.entries(assets).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { manifest: { version: 1, assets: sorted }, outputs, warnings, importedBy };
}

function toBuffer(out: GeneratedFile): Buffer {
  return Buffer.from(out.contents, out.encoding === "base64" ? "base64" : "utf8");
}

function bytesOf(src: string, dir: string, outputs: Map<string, Buffer>): Buffer | undefined {
  const rel = src.replace(/^assets\//, "");
  const generated = outputs.get(rel);
  if (generated) return generated;
  const onDisk = join(dir, rel);
  return existsSync(onDisk) ? readFileSync(onDisk) : undefined;
}

async function runImporter(importer: AssetImporter, file: SourceFile, root: string, cacheDir: string | undefined): Promise<ImportResult> {
  // The built-in importer only reads the path, so caching it would cost more than it saves.
  const cacheable = cacheDir && importer !== builtinImporter;
  const key = cacheable ? sha(`${importer.name}\0${JSON.stringify(file)}\0${sha(readFileSync(file.path))}`) : "";
  const cacheFile = cacheable ? join(cacheDir, `${key}.json`) : "";
  if (cacheable && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8")) as ImportResult;
  const result = "command" in importer ? await runCommandImporter(importer, file, root) : await importer.import(file);
  if (!result || typeof result !== "object" || typeof result.assets !== "object") {
    throw new Error(`importer "${importer.name}" returned an invalid result (expected { assets: {...} })`);
  }
  // A result with warnings and no assets is a failure (missing tool, bad env), which can be fixed
  // without touching the file, so it must be retried next time instead of being replayed from cache.
  const failed = Object.keys(result.assets).length === 0 && (result.warnings?.length ?? 0) > 0;
  if (cacheable && cacheDir && !failed) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(result));
  }
  return result;
}

/** Asset ids never referenced as a string literal in `src/`. Heuristic: reports, never deletes. */
export function findUnused(root: string, manifest: CompiledManifest): string[] {
  const source = walk(join(root, "src"))
    .filter((f) => /\.(ts|js|tsx|jsx|json)$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const quoted = (s: string) => source.includes(`"${s}"`) || source.includes(`'${s}'`) || source.includes(`\`${s}\``);
  return Object.keys(manifest.assets).filter((id) => {
    const group = manifest.assets[id]?.group;
    // Loading a whole group counts as using its members.
    return !quoted(id) && !(group && quoted(group));
  });
}

/**
 * Pack the PNGs the built-in importer produced into one or more atlases per preload group.
 * Lossless: pixels are copied exactly, entries gain a `rect` into the atlas, and sources are untouched.
 * Images larger than half the atlas size (backgrounds, splash screens) stay standalone.
 */
function packAtlases(
  dir: string,
  assets: Record<string, CompiledEntry>,
  importedBy: Record<string, string>,
  outputs: Map<string, Buffer>,
  options: AtlasOptions,
  cacheDir: string | undefined,
  warnings: string[],
): void {
  const maxSize = options.maxSize ?? 2048;
  const excluded = (id: string) => (options.exclude ?? []).some((e) => (e.endsWith("/") ? id.startsWith(e) : id === e));
  const groups = new Map<string, { id: string; png: Buffer }[]>();
  for (const [id, entry] of Object.entries(assets)) {
    if (entry.type !== "image" || importedBy[id] !== builtinImporter.name || !entry.src.toLowerCase().endsWith(".png") || excluded(id))
      continue;
    const png = readFileSync(join(dir, entry.src.slice("assets/".length)));
    if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) {
      warnings.push(`${entry.src}: not a valid PNG, left out of atlases`);
      continue;
    }
    // PNG header: width and height are big-endian u32 at byte 16 and 20.
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    if (w > maxSize / 2 || h > maxSize / 2) continue;
    // Ungrouped images and an `assets/default/` folder share the "default" atlas on purpose: the runtime's
    // `load()` treats a missing group as "default", so they are the same preload group.
    const group = entry.group ?? "default";
    groups.set(group, [...(groups.get(group) ?? []), { id, png }]);
  }
  for (const [group, inputs] of groups) {
    if (inputs.length < 2) continue; // a one-image atlas saves nothing
    inputs.sort((a, b) => (a.id < b.id ? -1 : 1));
    const key = sha(JSON.stringify({ options, maxSize, inputs: inputs.map((i) => [i.id, assets[i.id]?.hash]) }));
    const cached = cacheDir ? readAtlasCache(cacheDir, key) : undefined;
    let atlases: CachedAtlas[];
    try {
      atlases = cached ?? buildAtlases(inputs, { ...options, maxSize });
    } catch (err) {
      // A corrupt image must never break the pipeline: the group simply stays unpacked.
      warnings.push(`atlas "${group}" skipped: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!cached && cacheDir) writeAtlasCache(cacheDir, key, atlases);
    atlases.forEach((atlas, i) => {
      const path = `_atlas/${group.replaceAll("/", "-")}-${i}.png`;
      const png = Buffer.from(atlas.png);
      outputs.set(path, png);
      const hash = sha(png).slice(0, 12);
      for (const [id, rect] of atlas.rects) {
        const entry = assets[id];
        if (!entry) continue;
        assets[id] = { ...entry, src: `assets/${path}`, rect, hash };
      }
    });
  }
}

type CachedAtlas = { png: Uint8Array; width: number; height: number; rects: Map<string, { x: number; y: number; w: number; h: number }> };

function readAtlasCache(cacheDir: string, key: string): CachedAtlas[] | undefined {
  const meta = join(cacheDir, `${key}.json`);
  if (!existsSync(meta)) return undefined;
  const entries = JSON.parse(readFileSync(meta, "utf8")) as {
    width: number;
    height: number;
    rects: [string, { x: number; y: number; w: number; h: number }][];
  }[];
  return entries.map((e, i) => ({ ...e, png: readFileSync(join(cacheDir, `${key}-${i}.png`)), rects: new Map(e.rects) }));
}

function writeAtlasCache(cacheDir: string, key: string, atlases: CachedAtlas[]): void {
  mkdirSync(cacheDir, { recursive: true });
  for (const [i, a] of atlases.entries()) writeFileSync(join(cacheDir, `${key}-${i}.png`), a.png);
  writeFileSync(
    join(cacheDir, `${key}.json`),
    JSON.stringify(atlases.map((a) => ({ width: a.width, height: a.height, rects: [...a.rects] }))),
  );
}
