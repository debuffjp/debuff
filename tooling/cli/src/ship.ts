// `debuff ship <target>`: get a built game ready for a store and check what that store needs. It prepares
// files and prints the upload command; it never uploads or signs in, so nothing goes public by accident.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { CAPTURES_DIR } from "./agent-link.js";
import { baselineImages, type LaunchConfig, launchInfo } from "./launch.js";

export type ShipTarget = "itch" | "wavedash" | "press";
export const SHIP_TARGETS: ShipTarget[] = ["itch", "wavedash", "press"];

export interface ShipCheck {
  ok: boolean;
  /** `false` for advice that shouldn't fail the command. */
  required?: boolean;
  message: string;
}

export interface ShipResult {
  target: ShipTarget;
  checks: ShipCheck[];
  /** Files written, relative to the project root. */
  outputs: string[];
  /** What to run (or do) next. */
  next: string[];
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk(dir);
  return out.sort();
}

/** A zip of `files` (absolute paths) stored under their path relative to `base`. Deflate, no dependencies. */
export function zip(base: string, files: string[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(relative(base, file).split(sep).join("/"));
    const data = readFileSync(file);
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0x00210000, 10); // 1980-01-01, so the same build zips the same bytes
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0x00210000, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

/** Checks every web store cares about: an index.html at the top, and asset paths that work from a subfolder. */
function webChecks(dist: string): ShipCheck[] {
  const index = join(dist, "index.html");
  if (!existsSync(index)) return [{ ok: false, message: "dist/index.html exists (run `debuff build` first)" }];
  const html = readFileSync(index, "utf8");
  // Stores serve games from a subfolder or an iframe on another origin, so root-absolute URLs 404.
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^/"][^"]*)"/g)].map((m) => m[1]);
  return [
    { ok: true, message: "dist/index.html exists" },
    {
      ok: absolute.length === 0,
      message: absolute.length
        ? `asset paths are relative (found ${absolute.slice(0, 3).join(", ")}; set \`base: "./"\` in vite config)`
        : "asset paths are relative",
    },
  ];
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function ship(root: string, target: ShipTarget, launch: LaunchConfig = {}, isolated = false): ShipResult {
  const dist = join(root, "dist");
  const out = join(root, "ship");
  const result: ShipResult = { target, checks: [], outputs: [], next: [] };
  const write = (rel: string, data: string | Buffer) => {
    mkdirSync(join(out, ...rel.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(out, rel), data);
    result.outputs.push(`ship/${rel}`);
  };
  const { title, description } = launchInfo(root, launch);

  if (target === "itch") {
    result.checks.push(...webChecks(dist));
    if (!result.checks.every((c) => c.ok)) return result;
    // Telemetry and source maps don't belong in a store upload.
    const files = listFiles(dist).filter((f) => !f.endsWith(".map") && !f.endsWith("debuff-report.json"));
    const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
    const largest = Math.max(...files.map((f) => statSync(f).size));
    // itch.io's documented HTML5 limits: 1,000 files, 500 MB extracted, 200 MB per file.
    result.checks.push(
      { ok: files.length <= 1000, message: `${files.length} files (itch.io allows 1,000)` },
      { ok: bytes <= 500 * 1024 * 1024, message: `${mb(bytes)} extracted (itch.io allows 500 MB)` },
      { ok: largest <= 200 * 1024 * 1024, message: `largest file ${mb(largest)} (itch.io allows 200 MB)` },
    );
    if (!result.checks.every((c) => c.ok)) return result;
    write("itch.zip", zip(dist, files));
    result.next.push(
      "Upload ship/itch.zip on your itch.io project page, kind of project: HTML, and tick “This file will be played in the browser”.",
      "Or with butler: butler push ship/itch.zip <user>/<game>:html5",
    );
    if (isolated)
      result.next.push(
        "Isolation is on: under Embed options, tick “SharedArrayBuffer support”. itch.io marks it experimental and moves the game to a new domain, so players start with fresh saves. Keep a single-thread fallback for Safari.",
      );
  }

  if (target === "wavedash") {
    result.checks.push(...webChecks(dist));
    const toml = join(root, "wavedash.toml");
    const config = existsSync(toml) ? readFileSync(toml, "utf8") : undefined;
    const uploadDir = config?.match(/^\s*upload_dir\s*=\s*"([^"]+)"/m)?.[1];
    result.checks.push({
      ok: config !== undefined,
      message: config ? "wavedash.toml exists" : 'wavedash.toml exists (run `wavedash init`, with upload_dir = "./dist")',
    });
    if (config)
      result.checks.push({
        ok: uploadDir !== undefined && /^(\.\/)?dist\/?$/.test(uploadDir),
        message: `wavedash.toml upload_dir is ./dist${uploadDir ? ` (found ${uploadDir})` : ""}`,
      });
    const calls =
      existsSync(join(root, "src")) && listFiles(join(root, "src")).some((f) => readFileSync(f, "utf8").includes("Wavedash.init"));
    result.checks.push({
      ok: calls,
      message: "the game calls Wavedash.init() once it's ready (Wavedash keeps it behind a loading screen until then)",
    });
    result.next.push(
      "wavedash dev (play it locally inside Wavedash)",
      "wavedash build push (uploads a build and prints its id; it doesn't go live)",
      "Publishing needs a store description, 16:9 cover art and a preview video: `debuff ship press` collects screenshots to start from.",
    );
  }

  if (target === "press") {
    const shots = baselineImages(root);
    rmSync(join(out, "press"), { recursive: true, force: true });
    shots.forEach((shot, i) => {
      mkdirSync(join(out, "press", "screenshots"), { recursive: true });
      const rel = `press/screenshots/${String(i + 1).padStart(2, "0")}-${relative(join(root, "scenarios", "__baselines__"), shot)
        .split(sep)
        .join("-")}`;
      copyFileSync(shot, join(out, rel));
      result.outputs.push(`ship/${rel}`);
    });
    // Stills and clips saved from the dev panel or by agents (game_capture, game_clip).
    const captured = existsSync(join(root, CAPTURES_DIR)) ? readdirSync(join(root, CAPTURES_DIR)).sort() : [];
    const stills = captured.filter((f) => f.endsWith(".png"));
    const clips = captured.filter((f) => f.endsWith(".mp4") || f.endsWith(".webm"));
    for (const f of stills) {
      mkdirSync(join(out, "press", "screenshots"), { recursive: true });
      copyFileSync(join(root, CAPTURES_DIR, f), join(out, "press", "screenshots", `captured-${f}`));
      result.outputs.push(`ship/press/screenshots/captured-${f}`);
    }
    for (const f of clips) {
      mkdirSync(join(out, "press", "clips"), { recursive: true });
      copyFileSync(join(root, CAPTURES_DIR, f), join(out, "press", "clips", f));
      result.outputs.push(`ship/press/clips/${f}`);
    }
    result.checks.push({
      ok: shots.length + stills.length > 0,
      required: false,
      message: `${shots.length} screenshots from scenario baselines${stills.length ? ` and ${stills.length} from ${CAPTURES_DIR}` : ""}${shots.length + stills.length ? "" : " (run `debuff scenario --update` to make some)"}`,
    });
    result.checks.push({
      ok: clips.length > 0,
      required: false,
      message: `${clips.length} clips from ${CAPTURES_DIR}${clips.length ? "" : " (dev panel: rec, then clip)"}`,
    });
    if (clips.some((f) => f.endsWith(".webm")))
      result.checks.push({
        ok: false,
        required: false,
        message: "some clips are WebM, which X and most stores don't take: convert them with `ffmpeg -i clip.webm clip.mp4`",
      });
    result.checks.push({
      ok: Boolean(description),
      required: false,
      message: "a description (launch.description or package.json description)",
    });
    const links = Object.entries(launch.links ?? {});
    const facts = [
      `# ${title}`,
      "",
      description ?? "_One or two sentences on what the game is and why it's fun._",
      "",
      "## Factsheet",
      "",
      `- **Developer:** ${launch.author ?? "_you_"}`,
      `- **Play:** ${launch.url ?? "_link_"}`,
      "- **Platforms:** web browser (desktop and mobile)",
      `- **Built with:** [debuff](https://debuff.jp)`,
      ...(links.length ? ["", "## Links", "", ...links.map(([k, v]) => `- [${k}](${v})`)] : []),
      "",
      "## Screenshots",
      "",
      ...(shots.length + stills.length
        ? result.outputs.filter((o) => o.endsWith(".png")).map((o) => `![](${o.replace(/^ship\/press\//, "")})`)
        : ["_None yet._"]),
      "",
      "## Clips",
      "",
      ...(clips.length
        ? clips.map((f) => `- [${f}](clips/${f})`)
        : ["_None yet._ In `debuff dev`, press **rec** in the dev panel, play, then **clip** to save the last few seconds."]),
      "",
    ];
    write("press/README.md", facts.join("\n"));
    result.next.push("Send ship/press/ to press and use it for store pages. Add a short clip: stores and socials lead with video.");
  }

  return result;
}

export function shipFailed(result: ShipResult): boolean {
  return result.checks.some((c) => !c.ok && c.required !== false);
}
