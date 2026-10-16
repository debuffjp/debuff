import type { AssetType, FunctionImporter, ImportResult, SourceFile } from "../plugin.js";

const TYPES: Record<string, AssetType> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".avif": "image",
  ".gif": "image",
  ".json": "json",
  // Tiled maps/tilesets and LDtk projects are JSON (load with @debuffjp/tilemap).
  ".tmj": "json",
  ".tsj": "json",
  ".ldtk": "json",
  ".ogg": "audio",
  ".opus": "audio",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".txt": "text",
};

/** `hero@16x24.png` declares a 16×24 grid and the id "hero". Explicit by design: we never guess frame sizes. */
const GRID = /@(\d+)x(\d+)$/;

export const BUILTIN_EXTENSIONS = Object.keys(TYPES);

/** Images, JSON, audio and text, served as-is. */
export const builtinImporter: FunctionImporter = {
  name: "debuff:builtin",
  extensions: BUILTIN_EXTENSIONS,
  import(file: SourceFile): ImportResult {
    const type = TYPES[file.ext];
    if (!type) return { assets: {}, warnings: [`Skipped ${file.rel}: unsupported extension "${file.ext}"`] };
    let id = file.id;
    const grid = GRID.exec(id);
    if (grid) id = id.slice(0, grid.index);
    return {
      assets: {
        [id]: {
          type,
          src: `assets/${file.rel}`,
          ...(file.group ? { group: file.group } : {}),
          ...(grid ? { grid: { frameWidth: Number(grid[1]), frameHeight: Number(grid[2]) } } : {}),
        },
      },
    };
  },
};
