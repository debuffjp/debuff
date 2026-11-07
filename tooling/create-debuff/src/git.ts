import { spawnSync } from "node:child_process";
import { dirname } from "node:path";

/** What `initGit` did: committed, set up a repository but couldn't commit, or left git alone. */
export type GitResult = { status: "committed" } | { status: "initialised" | "skipped"; reason: string };

/**
 * Variables that point git at a repository other than the one in `cwd`. Git sets them for hooks, so a create
 * run from inside a hook (or a test run by one) would otherwise `git init` the outer repository, which turns
 * it bare. Identity and config variables (GIT_AUTHOR_*, GIT_CONFIG_*) still pass through.
 */
const REPO_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
  "GIT_NAMESPACE",
];

/** The environment with the repository-locating variables removed, so git finds the repository from `cwd`. */
export function gitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean = { ...env };
  for (const name of REPO_VARS) delete clean[name];
  return clean;
}

/** The trailer that credits debuff in a new project's first commit. GitHub shows the debuffbot account's avatar for it. */
export const DEBUFF_COAUTHOR = "Co-authored-by: debuff <353358385+debuffbot@users.noreply.github.com>";

export interface GitOptions {
  /** Credit debuff as co-author of the first commit (from 0.32). Default true; `--no-credit` turns it off. */
  credit?: boolean;
}

/**
 * Start a new project as a git repository with one first commit, so every change an agent makes from here
 * shows as a diff to review or undo. Leaves git alone when it isn't installed, or when the project is inside
 * another repository (a monorepo). Never sets an identity: without user.name and user.email it stops after `git init`.
 * The branch is `main` unless the user set `init.defaultBranch`, and the commit skips hooks, so a global hook
 * can't stop a scaffold. Only this first commit carries the credit; nothing is installed for later ones.
 */
export function initGit(dir: string, message: string, { credit = true }: GitOptions = {}): GitResult {
  const env = gitEnv();
  const git = (args: string[], cwd = dir) => spawnSync("git", args, { cwd, encoding: "utf8", env });
  const version = git(["--version"]);
  if (version.error || version.status !== 0) return { status: "skipped", reason: "git isn't installed" };
  if (git(["rev-parse", "--is-inside-work-tree"], dirname(dir)).stdout.trim() === "true")
    return { status: "skipped", reason: "the folder is already inside a git repository" };
  // `-b` needs git 2.28; older versions fall back to plain init.
  const chosen = git(["config", "init.defaultBranch"]).stdout.trim();
  const init = chosen ? git(["init", "-q"]) : git(["init", "-q", "-b", "main"]);
  if (init.status !== 0 && git(["init", "-q"]).status !== 0) return { status: "skipped", reason: "git init failed" };
  if (git(["add", "-A"]).status !== 0) return { status: "initialised", reason: "git add failed" };
  const commit = git(["commit", "-q", "--no-verify", "-m", credit ? `${message}\n\n${DEBUFF_COAUTHOR}` : message]);
  if (commit.status !== 0)
    return {
      status: "initialised",
      reason: /user\.(name|email)|identity/i.test(commit.stderr)
        ? "set git user.name and user.email, then commit"
        : commit.stderr.trim().split("\n")[0] || "git commit failed",
    };
  return { status: "committed" };
}
