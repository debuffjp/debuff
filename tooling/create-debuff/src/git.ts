import { spawnSync } from "node:child_process";
import { dirname } from "node:path";

/** What `initGit` did: committed, set up a repository but couldn't commit, or left git alone. */
export type GitResult = { status: "committed" } | { status: "initialised" | "skipped"; reason: string };

/**
 * Start a new project as a git repository with one first commit, so every change an agent makes from here
 * shows as a diff to review or undo. Leaves git alone when it isn't installed, or when the project is inside
 * another repository (a monorepo). Never sets an identity: without user.name and user.email it stops after `git init`.
 */
export function initGit(dir: string, message: string): GitResult {
  const git = (args: string[], cwd = dir) => spawnSync("git", args, { cwd, encoding: "utf8" });
  const version = git(["--version"]);
  if (version.error || version.status !== 0) return { status: "skipped", reason: "git isn't installed" };
  if (git(["rev-parse", "--is-inside-work-tree"], dirname(dir)).stdout.trim() === "true")
    return { status: "skipped", reason: "the folder is already inside a git repository" };
  if (git(["init", "-q"]).status !== 0) return { status: "skipped", reason: "git init failed" };
  if (git(["add", "-A"]).status !== 0) return { status: "initialised", reason: "git add failed" };
  const commit = git(["commit", "-q", "-m", message]);
  if (commit.status !== 0)
    return {
      status: "initialised",
      reason: /user\.(name|email)|identity/i.test(commit.stderr)
        ? "set git user.name and user.email, then commit"
        : (commit.stderr.trim().split("\n")[0] ?? "git commit failed"),
    };
  return { status: "committed" };
}
