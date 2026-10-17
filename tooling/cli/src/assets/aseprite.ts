import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { FunctionImporter, ImportResult, SourceFile, ToolingPlugin } from "../plugin.js";

export interface AsepriteOptions {
  /** Path to the Aseprite executable. Default: `$ASEPRITE`, then `aseprite` on PATH, then the usual install folders. */
  binary?: string;
  /** @internal Runs Aseprite; replaced in tests. */
  exec?: (binary: string, args: string[]) => void;
}

const GRID = /@(\d+)x(\d+)$/;

/** Where Aseprite usually lives, per platform (Steam and standalone installs). */
function candidates(): string[] {
  const env = process.env;
  if (process.platform === "win32") {
    const roots = [env.ProgramFiles, env["ProgramFiles(x86)"]].filter((r): r is string => !!r);
    return roots.flatMap((r) => [join(r, "Aseprite", "Aseprite.exe"), join(r, "Steam", "steamapps", "common", "Aseprite", "Aseprite.exe")]);
  }
  if (process.platform === "darwin")
    return [
      "/Applications/Aseprite.app/Contents/MacOS/aseprite",
      join(env.HOME ?? "", "Library/Application Support/Steam/steamapps/common/Aseprite/Aseprite.app/Contents/MacOS/aseprite"),
    ];
  return ["/usr/bin/aseprite", "/usr/local/bin/aseprite", join(env.HOME ?? "", ".steam/steam/steamapps/common/Aseprite/aseprite")];
}

/** Find the Aseprite executable, or undefined. */
export function findAseprite(explicit?: string): string | undefined {
  if (explicit) return existsSync(explicit) ? explicit : undefined;
  const fromEnv = process.env.ASEPRITE;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const names = process.platform === "win32" ? ["aseprite.exe", "Aseprite.exe"] : ["aseprite"];
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean))
    for (const name of names) if (existsSync(join(dir, name))) return join(dir, name);
  return candidates().find((p) => existsSync(p));
}

interface SheetData {
  frames: { frame: { x: number; y: number; w: number; h: number } }[];
  meta: { size: { w: number; h: number } };
}

/**
 * Imports `.aseprite` / `.ase` files by running Aseprite, so you never export by hand.
 *
 * - `name@WxH.aseprite`: flattened to one PNG with a W×H grid, e.g. a bitmap-font sheet.
 * - `name.aseprite` with several frames: a sprite sheet, one cell per frame, so `assets.frames("name")` returns them in order.
 *
 * Hidden layers are left out, so guide layers stay in the source only. Results are cached by content.
 */
export function asepriteImporter(options: AsepriteOptions = {}): FunctionImporter {
  const exec = options.exec ?? ((bin, args) => execFileSync(bin, args, { stdio: "pipe" }));
  return {
    name: "aseprite",
    extensions: [".aseprite", ".ase"],
    import(file: SourceFile): ImportResult {
      const binary = options.exec ? (options.binary ?? "aseprite") : findAseprite(options.binary);
      if (!binary)
        return {
          assets: {},
          warnings: [
            `Skipped ${file.rel}: Aseprite not found. Install it, put it on PATH, or set ASEPRITE to its executable (or pass aseprite({ binary })).`,
          ],
        };
      let id = file.id;
      const grid = GRID.exec(id);
      if (grid) id = id.slice(0, grid.index);
      const out = file.rel.slice(0, -file.ext.length).replace(GRID, "");
      const dir = mkdtempSync(join(tmpdir(), "debuff-aseprite-"));
      try {
        const png = join(dir, "sheet.png");
        const data = join(dir, "sheet.json");
        exec(binary, ["-b", file.path, "--sheet", png, "--sheet-type", "rows", "--data", data, "--format", "json-array"]);
        const sheet = JSON.parse(readFileSync(data, "utf8")) as SheetData;
        const first = sheet.frames[0]?.frame;
        const cell = grid
          ? { frameWidth: Number(grid[1]), frameHeight: Number(grid[2]) }
          : sheet.frames.length > 1 && first
            ? { frameWidth: first.w, frameHeight: first.h }
            : undefined;
        return {
          assets: {
            [id]: {
              type: "image",
              src: `assets/${out}.png`,
              ...(file.group ? { group: file.group } : {}),
              ...(cell ? { grid: cell } : {}),
            },
          },
          outputs: [{ path: `${out}.png`, contents: readFileSync(png).toString("base64"), encoding: "base64" }],
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
        return { assets: {}, warnings: [`Skipped ${file.rel}: Aseprite failed (${detail})`] };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Tooling plugin: `.aseprite` files in `assets/` become PNGs and sprite sheets automatically.
 *
 * ```ts
 * // debuff.config.ts
 * import { aseprite, defineConfig } from "@debuffjp/cli";
 * export default defineConfig({ plugins: [aseprite()] });
 * ```
 */
export function aseprite(options: AsepriteOptions = {}): ToolingPlugin {
  return { name: "aseprite", apiVersion: 1, assets: [asepriteImporter(options)] };
}
