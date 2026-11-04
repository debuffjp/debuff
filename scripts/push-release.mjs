#!/usr/bin/env node
// The last step of release:ci: pushes any commit the release made (the plugin sync) to main.
// Other commits can land on main during a release run, so a plain push can be rejected.
import { execFileSync, spawnSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { stdio: "inherit" });
const ok = (...args) => spawnSync("git", args, { stdio: "inherit" }).status === 0;

for (let attempt = 1; attempt <= 5; attempt++) {
  git("fetch", "--quiet", "origin", "main");
  if (ok("merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD")) {
    console.log("release made no new commits to push");
    process.exit(0);
  }
  git("rebase", "FETCH_HEAD");
  if (ok("push", "origin", "HEAD:main")) process.exit(0);
}
console.error("main kept moving: re-run the Release workflow");
process.exit(1);
