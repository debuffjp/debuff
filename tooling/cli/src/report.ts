import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { lime, paint, pc, pink, sky } from "create-debuff";
import { DebuffError } from "./errors.js";

export interface FileReport {
  path: string;
  kind: "code" | "html" | "asset" | "map" | "other";
  bytes: number;
  gzip: number;
  brotli: number;
  /** Code fetched only when needed (a dynamic import), not at startup. */
  lazy?: boolean;
}

export interface BuildReport {
  dir: string;
  files: FileReport[];
  totals: Record<FileReport["kind"], { bytes: number; gzip: number; brotli: number }>;
  /** Code the page loads at startup (what players wait for). `totals.code` also counts on-demand chunks. */
  initial: { bytes: number; gzip: number; brotli: number };
  largestAsset: FileReport | undefined;
  leaks: { path: string; token: string }[];
}

/** Tokens that only exist in dev builds. Kept short so false positives are unlikely. */
export const DEV_TOKENS = ["__DEBUFF_DEV__"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function kindOf(path: string): FileReport["kind"] {
  const ext = extname(path);
  if (ext === ".map") return "map";
  if (ext === ".js" || ext === ".mjs" || ext === ".css") return "code";
  if (ext === ".html") return "html";
  if (/\.(png|jpe?g|webp|gif|ogg|mp3|wav|m4a|json|txt|woff2?)$/.test(path)) return "asset";
  return "other";
}

export function buildReport(dir: string): BuildReport {
  if (!existsSync(dir)) throw new DebuffError("nothing_to_run", `No build output at ${dir}.`, "Run `npx debuff build` first");
  const files: FileReport[] = [];
  const leaks: BuildReport["leaks"] = [];
  for (const file of walk(dir).sort()) {
    if (basename(file).startsWith(".") || basename(file) === "debuff-report.json") continue;
    const data = readFileSync(file);
    const path = relative(dir, file).split(sep).join("/");
    const kind = kindOf(path);
    files.push({ path, kind, bytes: data.length, gzip: gzipSync(data).length, brotli: brotliCompressSync(data).length });
    if (kind === "code" || kind === "html") {
      const text = data.toString("utf8");
      for (const token of DEV_TOKENS) if (text.includes(token)) leaks.push({ path, token });
    }
  }
  // Startup code is what index.html references (its scripts and Vite's modulepreload links); other code
  // files are chunks loaded on demand, like the splash or the Canvas 2D fallback.
  const pages = files
    .filter((f) => f.kind === "html")
    .map((f) => readFileSync(join(dir, f.path), "utf8"))
    .join("\n");
  const referenced = new Set([...pages.matchAll(/(?:src|href)="\/?([^"]+)"/g)].map((m) => (m[1] ?? "").replace(/^\.\//, "")));
  if (pages) for (const f of files) if (f.kind === "code" && !referenced.has(f.path)) f.lazy = true;
  const zero = () => ({ bytes: 0, gzip: 0, brotli: 0 });
  const initial = zero();
  const totals: BuildReport["totals"] = { code: zero(), html: zero(), asset: zero(), map: zero(), other: zero() };
  for (const f of files) {
    const t = totals[f.kind];
    t.bytes += f.bytes;
    t.gzip += f.gzip;
    t.brotli += f.brotli;
    if (f.kind === "code" && !f.lazy) {
      initial.bytes += f.bytes;
      initial.gzip += f.gzip;
      initial.brotli += f.brotli;
    }
  }
  const largestAsset = files.filter((f) => f.kind === "asset").sort((a, b) => b.bytes - a.bytes)[0];
  return { dir, files, totals, initial, largestAsset, leaks };
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;

export function formatReport(r: BuildReport): string {
  const w = Math.max(...r.files.map((f) => f.path.length), 4);
  const kindColor: Record<FileReport["kind"], (s: string) => string> = {
    code: sky,
    html: (s: string) => paint("violet", s),
    asset: pink,
    map: pc.dim,
    other: pc.dim,
  };
  const lines = [pc.dim(`${"file".padEnd(w)}  ${"raw".padStart(9)}  ${"gzip".padStart(9)}  ${"brotli".padStart(9)}`)];
  for (const f of r.files) {
    lines.push(
      `${kindColor[f.kind](f.path.padEnd(w))}  ${pc.dim(kb(f.bytes).padStart(9))}  ${kb(f.gzip).padStart(9)}  ${pc.bold(kb(f.brotli).padStart(9))}${f.lazy ? pc.dim("  on demand") : ""}`,
    );
  }
  lines.push("");
  for (const [kind, t] of Object.entries(r.totals) as [FileReport["kind"], BuildReport["totals"]["code"]][]) {
    if (t.bytes)
      lines.push(
        `${kindColor[kind](kind.padEnd(6))} ${pc.bold(kb(t.brotli))} brotli  ${pc.dim(`${kb(t.gzip)} gzip · ${kb(t.bytes)} raw`)}`,
      );
  }
  if (r.largestAsset) lines.push(pc.dim(`largest asset: ${r.largestAsset.path} (${kb(r.largestAsset.bytes)})`));
  lines.push(
    r.leaks.length ? pc.red(`✖ dev leaks: ${r.leaks.map((l) => `${l.token} in ${l.path}`).join(", ")}`) : lime("✔ dev boundary clean"),
  );
  return lines.join("\n");
}
