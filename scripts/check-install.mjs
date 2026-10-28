// Fail fast when this checkout has no install of its own. Node walks up the directory tree for
// node_modules, so a git worktree under .claude/worktrees/ without one quietly resolves another
// checkout's packages, and typecheck reports errors in code that doesn't exist here.
import { existsSync, realpathSync } from "node:fs";
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
