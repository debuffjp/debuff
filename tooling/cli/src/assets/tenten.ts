import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { FunctionImporter, ImportResult, SourceFile, ToolingPlugin } from "../plugin.js";
import { quoteWindows } from "./command.js";

export interface TentenOptions {
  /** Command that runs tenten, e.g. `["node", "tools/tenten/bin/tenten.js"]`. Default: `$TENTEN`, then the project's installed `tenten`, then `npx -y -p @debuffjp/tenten tenten`. */
  command?: string[];
  /** @internal Runs the command; replaced in tests. */
  exec?: (command: string[]) => void;
}

const GRID = /@(\d+)x(\d+)$/;

/** How to run tenten for a file: an explicit command, `$TENTEN`, the copy installed next to the file, or npx, which fetches it. */
export function findTenten(near: string, explicit?: string[]): string[] {
  if (explicit) return explicit;
  const fromEnv = process.env.TENTEN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv.endsWith(".js") ? [process.execPath, fromEnv] : [fromEnv];
  try {
    const pkg = createRequire(near).resolve("@debuffjp/tenten/package.json");
    return [process.execPath, join(dirname(pkg), "bin", "tenten.js")];
  } catch {
    return ["npx", "-y", "--package", "@debuffjp/tenten", "tenten"];
  }
}

interface SheetJson {
  frames: Record<string, { frame: { w: number; h: number } }>;
}

/**
 * Imports `.tt` files, the sprite format of [tenten](https://github.com/debuffjp/tenten), the pixel-art tool agents
 * draw with. Multi-frame files become sprite sheets, one cell per frame, and `name@WxH.tt` is a grid of that size.
 * tenten is run from `$TENTEN`, the project's installed copy, or fetched with npx the first time a `.tt` file is seen.
 */
export function tentenImporter(options: TentenOptions = {}): FunctionImporter {
  const exec =
    options.exec ??
    ((command) =>
      process.platform === "win32"
        ? execFileSync(command.map(quoteWindows).join(" "), { stdio: "pipe", shell: true })
        : execFileSync(command[0] as string, command.slice(1), { stdio: "pipe" }));
  return {
    name: "tenten",
    extensions: [".tt"],
    import(file: SourceFile): ImportResult {
      let id = file.id;
      const grid = GRID.exec(id);
      if (grid) id = id.slice(0, grid.index);
      const out = file.rel.slice(0, -file.ext.length).replace(GRID, "");
      const name = basename(file.rel, file.ext);
      const dir = mkdtempSync(join(tmpdir(), "debuff-tenten-"));
      try {
        exec([...findTenten(file.path, options.command), "export", file.path, "--out", dir]);
        const sheet = JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as SheetJson;
        const frames = Object.values(sheet.frames);
        const first = frames[0]?.frame;
        const cell = grid
          ? { frameWidth: Number(grid[1]), frameHeight: Number(grid[2]) }
          : frames.length > 1 && first
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
          outputs: [{ path: `${out}.png`, contents: readFileSync(join(dir, `${name}.png`)).toString("base64"), encoding: "base64" }],
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
        return {
          assets: {},
          warnings: [
            `Skipped ${file.rel}: tenten failed (${detail}). tenten needs Node 24; set TENTEN to its bin/tenten.js or pass tenten({ command }).`,
          ],
        };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Tooling plugin: `.tt` sprites drawn with tenten become PNGs and sprite sheets automatically.
 *
 * ```ts
 * // debuff.config.ts
 * import { defineConfig, tenten } from "@debuffjp/cli";
 * export default defineConfig({ plugins: [tenten()] });
 * ```
 */
export function tenten(options: TentenOptions = {}): ToolingPlugin {
  return { name: "tenten", apiVersion: 1, assets: [tentenImporter(options)] };
}
