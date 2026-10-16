import { cpSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
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
export function scaffold(options: ScaffoldOptions): string {
  const dest = resolve(options.dir);
  if (!isEmptyDir(dest)) throw new Error(`${dest} is not empty`);
  const template = options.template ?? "basic";
  const src = join(templatesDir(), template);
  if (!existsSync(src)) {
    throw new Error(
      `Unknown template "${template}". Available: ${listTemplates()
        .map((t) => t.id)
        .join(", ")}`,
    );
  }
  const skip = new Set(["template.json", "node_modules", "dist", ".debuff"]);
  cpSync(src, dest, { recursive: true, filter: (p) => !skip.has(basename(p)) });
  // npm strips .gitignore from published packages, so templates ship it without the dot.
  if (existsSync(join(dest, "gitignore"))) renameSync(join(dest, "gitignore"), join(dest, ".gitignore"));

  const pkgPath = join(dest, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, Record<string, string> | string>;
  pkg.name = options.name ?? packageName(dest);
  const version = ownVersion();
  // Pin @debuff/* to this release; the 0.0.0 placeholders are only meaningful inside the monorepo.
  if (version !== "0.0.0") {
    for (const field of ["dependencies", "devDependencies"] as const) {
      const deps = pkg[field];
      if (typeof deps === "object") for (const dep of Object.keys(deps)) if (dep.startsWith("@debuff/")) deps[dep] = `^${version}`;
    }
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
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
