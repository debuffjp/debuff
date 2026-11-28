// Fail fast when this checkout has no install of its own. Node walks up the directory tree for
// node_modules, so a git worktree under .claude/worktrees/ without one quietly resolves another
// checkout's packages, and typecheck reports errors in code that doesn't exist here. It also fails when
// the lockfile names a package this install lacks (a pull that added a dependency, papercut #63).
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const probe = "@debuffjp/core";

let dir = root;
let found;
for (;;) {
  const candidate = join(dir, "node_modules", probe);
  if (existsSync(candidate)) {
    found = realpathSync(candidate);
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

const inside = found && !relative(realpathSync(root), found).startsWith("..");
if (!inside) {
  console.error(
    found
      ? `✖ ${probe} resolves to ${found}, outside this checkout (${root}).\n  This checkout has no install of its own. Run \`npm ci\` here first.`
      : `✖ ${probe} isn't installed. Run \`npm ci\` first.`,
  );
  process.exit(2);
}

// Optional packages are platform builds (rolldown, esbuild): most of them never install on this machine.
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const missing = Object.entries(lock.packages)
  .filter(([path, entry]) => path.includes("node_modules/") && !entry.optional && !entry.devOptional)
  .map(([path]) => path)
  .filter((path) => !existsSync(join(root, path)));
if (missing.length) {
  const names = missing.map((path) => path.slice(path.lastIndexOf("node_modules/") + 13));
  console.error(
    `✖ ${missing.length} package${missing.length === 1 ? "" : "s"} in package-lock.json ${missing.length === 1 ? "isn't" : "aren't"} installed: ${names.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}.
  Run \`npm ci\` (or \`npm install\`) here first.`,
  );
  process.exit(2);
}
