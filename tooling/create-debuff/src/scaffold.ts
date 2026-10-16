import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Templates ship inside the published package (copied at build) and live at the repo
 *  root during development. */
export function templatesDir(): string {
  for (const dir of [join(here, "..", "templates"), join(here, "..", "..", "..", "templates")]) {
    if (existsSync(dir)) return dir;
  }
  throw new Error("create-debuff: templates directory not found");
}

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
}

export function listTemplates(): TemplateInfo[] {
  const dir = templatesDir();
  return readdirSync(dir)
    .filter((id) => existsSync(join(dir, id, "package.json")))
    .map((id) => {
      const meta = join(dir, id, "template.json");
      const info = existsSync(meta) ? (JSON.parse(readFileSync(meta, "utf8")) as Partial<TemplateInfo>) : {};
      return { id, title: info.title ?? id, description: info.description ?? "" };
    });
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

export function scaffold(options: ScaffoldOptions): string {
  const dest = resolve(options.dir);
  if (!isEmptyDir(dest)) throw new Error(`${dest} is not empty`);
  const template = options.template ?? "basic";
  if (isRemoteTemplate(template)) throw new Error(`"${template}" is a remote template; use scaffoldRemote()`);
  const src = join(templatesDir(), template);
  if (!existsSync(src)) {
    throw new Error(
      `Unknown template "${template}". Available: ${listTemplates()
        .map((t) => t.id)
        .join(", ")}`,
    );
  }
  return copyTemplate(src, dest, options.name);
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
