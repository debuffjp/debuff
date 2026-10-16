import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export type AssetType = "image" | "json" | "audio" | "text";

export interface CompiledEntry {
  type: AssetType;
  src: string;
  group?: string;
  grid?: { frameWidth: number; frameHeight: number };
  bytes: number;
  hash: string;
}

export interface CompiledManifest {
  version: 1;
  assets: Record<string, CompiledEntry>;
}

const TYPES: Record<string, AssetType> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".json": "json",
  ".ogg": "audio",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".txt": "text",
};

/** Filename convention for sprite sheets: `hero@16x24.png` → grid 16×24, id "hero".
 *  Explicit by design; we never guess frame sizes from pixels. */
const GRID = /@(\d+)x(\d+)$/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Scan `<root>/public/assets`, write `manifest.json` beside the assets. Source files are
 *  never modified. Subfolders become preload groups; top-level files are "default". */
export function compileAssets(root: string): { manifest: CompiledManifest; warnings: string[]; path: string } {
  const dir = join(root, "public", "assets");
  const warnings: string[] = [];
  const assets: Record<string, CompiledEntry> = {};
  for (const file of walk(dir).sort()) {
    const rel = relative(dir, file).split(sep).join("/");
    if (rel === "manifest.json" || rel.endsWith(".license") || rel.startsWith(".")) continue;
    const ext = extname(file).toLowerCase();
    const type = TYPES[ext];
    if (!type) {
      warnings.push(`Skipped ${rel}: unsupported extension "${ext}"`);
      continue;
    }
    const parts = rel.split("/");
    const group = parts.length > 1 ? parts[0] : undefined;
    let base = parts[parts.length - 1]!.slice(0, -ext.length);
    const grid = GRID.exec(base);
    if (grid) base = base.slice(0, grid.index);
    const id = (group ? `${group}/` : "") + base;
    if (assets[id]) {
      warnings.push(`Duplicate asset id "${id}" (${rel}); keeping ${assets[id].src}`);
      continue;
    }
    const data = readFileSync(file);
    const entry: CompiledEntry = {
      type,
      src: `assets/${rel}`,
      bytes: data.length,
      hash: createHash("sha256").update(data).digest("hex").slice(0, 12),
    };
    if (group) entry.group = group;
    if (grid) entry.grid = { frameWidth: Number(grid[1]), frameHeight: Number(grid[2]) };
    assets[id] = entry;
  }
  const manifest: CompiledManifest = { version: 1, assets };
  const path = join(dir, "manifest.json");
  if (existsSync(dir)) writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
  return { manifest, warnings, path };
}

/** Asset ids that never appear as string literals in `src/`. Heuristic: reports, never deletes. */
export function findUnused(root: string, manifest: CompiledManifest): string[] {
  const source = walk(join(root, "src"))
    .filter((f) => /\.(ts|js|tsx|jsx|json)$/.test(f))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  return Object.keys(manifest.assets).filter((id) => {
    const group = manifest.assets[id]!.group;
    // Loading a whole group counts as using its members only if referenced individually elsewhere;
    // we stay conservative and treat group usage as use.
    const quoted = (s: string) => source.includes(`"${s}"`) || source.includes(`'${s}'`) || source.includes(`\`${s}\``);
    return !quoted(id) && !(group && quoted(group));
  });
}
