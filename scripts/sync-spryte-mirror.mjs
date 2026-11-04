#!/usr/bin/env node
// Copies packages/spryte onto github.com/debuffjp/spryte when the version here differs from the mirror's.
// Dry run by default: prints what would change. --push commits and pushes. --dir <path> keeps the clone.
// In CI the release job sets SPRYTE_MIRROR_TOKEN; without it, --push uses your own git credentials.
import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const PACKAGE = "packages/spryte";
// Files only the mirror has. Its CI differs too: there it runs alone, outside the workspace.
const MIRROR_OWNED = [".git", ".github", "docs/brand", "docs/charts", "package-lock.json"];

const args = process.argv.slice(2);
const push = args.includes("--push");
const dirFlag = args.indexOf("--dir");
const clone = dirFlag >= 0 ? args[dirFlag + 1] : join(mkdtempSync(join(tmpdir(), "spryte-mirror-")), "repo");

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const version = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
const owned = (path) => MIRROR_OWNED.some((o) => path === o || path.startsWith(`${o}/`));

function clearUnowned(dir, prefix = "") {
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (owned(path)) continue;
    if (entry.isDirectory() && MIRROR_OWNED.some((o) => o.startsWith(`${path}/`))) clearUnowned(dir, `${path}/`);
    else rmSync(join(dir, path), { recursive: true, force: true });
  }
}

const root = git(process.cwd(), "rev-parse", "--show-toplevel");
const source = join(root, PACKAGE);
const token = process.env.SPRYTE_MIRROR_TOKEN;
const auth = token ? `x-access-token:${token}@` : "";
execFileSync("git", ["clone", "--quiet", "--depth", "1", `https://${auth}github.com/debuffjp/spryte.git`, clone], {
  stdio: "inherit",
});

const from = version(clone);
const to = version(source);
if (from === to) {
  console.log(`spryte mirror already at ${to}`);
  process.exit(0);
}

clearUnowned(clone);
for (const file of git(root, "ls-files", "--", PACKAGE).split("\n")) {
  const path = file.slice(PACKAGE.length + 1);
  if (owned(path)) continue;
  cpSync(join(root, file), join(clone, path), { recursive: true });
}
if (existsSync(join(clone, "package-lock.json"))) {
  execSync("npm install --package-lock-only --ignore-scripts --no-audit --no-fund", { cwd: clone, stdio: "inherit" });
}

git(clone, "add", "-A");
console.log(git(clone, "diff", "--cached", "--shortstat"));
if (!push) {
  console.log(`dry run: would sync spryte ${from} to ${to} in ${clone}`);
  process.exit(0);
}

const sha = git(root, "rev-parse", "--short", "HEAD");
git(
  clone,
  "-c",
  "user.name=github-actions[bot]",
  "-c",
  "user.email=41898282+github-actions[bot]@users.noreply.github.com",
  "commit",
  "--quiet",
  "-m",
  `Sync spryte ${to} from debuff@${sha}`,
);
git(clone, "push", "--quiet", "origin", "HEAD:main");
console.log(`synced spryte ${from} to ${to}`);
if (dirFlag < 0) rmSync(dirname(clone), { recursive: true, force: true });
