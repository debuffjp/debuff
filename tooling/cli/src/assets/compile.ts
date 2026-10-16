import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { AssetImporter, CompiledEntry, GeneratedFile, ImportResult, SourceFile, ToolingPlugin } from "../plugin.js";
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
  if (cacheable && cacheDir) {
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
