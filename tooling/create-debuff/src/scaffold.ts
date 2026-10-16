import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICIAL_TEMPLATES } from "./official.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Templates ship inside the published package (copied at build) and live at the repo
 *  root during development. */
export function templatesDir(): string {
  // Installed from npm: the bundled copy. In a repo checkout: the repo's templates/, so a stale
  // bundled copy left by `npm pack` can never shadow the real templates during development.
  const bundled = join(here, "..", "templates");
  const repo = join(here, "..", "..", "..", "templates");
  const installed = here.split(sep).includes("node_modules");
  for (const dir of installed ? [bundled] : [repo, bundled]) {
    if (existsSync(dir)) return dir;
  }
  throw new Error("create-debuff: templates directory not found");
}

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
}

/** Templates available locally (bundled in the package, or every template in a repo checkout). */
function localTemplates(): TemplateInfo[] {
  const dir = templatesDir();
  return readdirSync(dir)
    .filter((id) => existsSync(join(dir, id, "package.json")))
    .map((id) => {
      const meta = join(dir, id, "template.json");
      const info = existsSync(meta) ? (JSON.parse(readFileSync(meta, "utf8")) as Partial<TemplateInfo>) : {};
      return { id, title: info.title ?? id, description: info.description ?? "" };
    });
}

/** Every template: local ones plus official templates that download on demand. */
export function listTemplates(): TemplateInfo[] {
  const local = localTemplates();
  const remote = OFFICIAL_TEMPLATES.filter((t) => !local.some((l) => l.id === t.id)).map(({ id, title, description }) => ({
    id,
    title,
    description,
  }));
  return [...local, ...remote];
}

/**
 * Where a template comes from: a local folder (bundled, or the repo checkout during development),
 * an official template's git source, or a git source given directly.
 */
export function resolveTemplate(template: string): { kind: "local"; dir: string } | { kind: "remote"; source: string } {
  if (isRemoteTemplate(template)) return { kind: "remote", source: template };
  const dir = join(templatesDir(), template);
  if (existsSync(join(dir, "package.json"))) return { kind: "local", dir };
  const official = OFFICIAL_TEMPLATES.find((t) => t.id === template);
  if (official) return { kind: "remote", source: official.source };
  throw new Error(
    `Unknown template "${template}". Available: ${listTemplates()
      .map((t) => t.id)
      .join(", ")}, or a git source like github:user/repo`,
  );
}

export interface ScaffoldOptions {
  dir: string;
  template?: string;
  /** Package name; defaults to the directory name. */
  name?: string;
}

export function packageName(dir: string): string {
  return (
    basename(resolve(dir))
      .toLowerCase()
      .replace(/[^a-z0-9-~._]/g, "-")
      .replace(/^[._-]+/, "") || "debuff-game"
  );
}

export function isEmptyDir(dir: string): boolean {
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

/** Copy a template into `dir`. Throws if `dir` is non-empty. Returns the resolved path. */
/** Git-hosted templates: `github:user/repo`, `gitlab:user/repo/subdir#ref`, also `bitbucket:` and `sourcehut:`. */
export function isRemoteTemplate(template: string): boolean {
  return /^(github|gitlab|bitbucket|sourcehut):/.test(template);
}

/** Download a git-hosted template (via giget, no git binary needed) and scaffold from it. */
export async function scaffoldRemote(options: ScaffoldOptions & { template: string }): Promise<string> {
  const dest = resolve(options.dir);
  if (!isEmptyDir(dest)) throw new Error(`${dest} is not empty`);
  const { downloadTemplate } = await import("giget");
  const staging = mkdtempSync(join(tmpdir(), "create-debuff-"));
  try {
    const { dir } = await downloadTemplate(options.template, { dir: join(staging, "template"), force: true });
    if (!existsSync(join(dir, "package.json"))) throw new Error(`Template "${options.template}" has no package.json at its root`);
    return copyTemplate(dir, dest, options.name);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Scaffold from a local template. Use `create()` to also handle official and git-hosted templates. */
export function scaffold(options: ScaffoldOptions): string {
  const dest = resolve(options.dir);
  if (!isEmptyDir(dest)) throw new Error(`${dest} is not empty`);
  const resolved = resolveTemplate(options.template ?? "basic");
  if (resolved.kind === "remote")
    throw new Error(`"${options.template}" downloads from ${resolved.source}; use create() or scaffoldRemote()`);
  return copyTemplate(resolved.dir, dest, options.name);
}

/** Scaffold from any template: local, official (downloaded on demand) or a git source. */
export async function create(options: ScaffoldOptions): Promise<string> {
  const resolved = resolveTemplate(options.template ?? "basic");
  if (resolved.kind === "local") return scaffold(options);
  return scaffoldRemote({ ...options, template: resolved.source });
}

function copyTemplate(src: string, dest: string, name: string | undefined): string {
  const skip = new Set(["template.json", "node_modules", "dist", ".debuff", ".git"]);
  cpSync(src, dest, { recursive: true, filter: (p) => !skip.has(basename(p)) });
  // npm strips .gitignore from published packages, so templates ship it without the dot.
  if (existsSync(join(dest, "gitignore"))) renameSync(join(dest, "gitignore"), join(dest, ".gitignore"));

  const pkgPath = join(dest, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, Record<string, string> | string>;
  pkg.name = name ?? packageName(dest);
  const version = ownVersion();
  // Pin @debuff/* to this release; the 0.0.0 placeholders are only meaningful inside the monorepo.
  if (version !== "0.0.0") {
    for (const field of ["dependencies", "devDependencies"] as const) {
      const deps = pkg[field];
      if (typeof deps === "object") for (const dep of Object.keys(deps)) if (dep.startsWith("@debuff/")) deps[dep] = `^${version}`;
    }
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return dest;
}

export function ownVersion(): string {
  return (JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string }).version;
}

export function detectPackageManager(): "npm" | "pnpm" | "yarn" | "bun" {
  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  return "npm";
}
