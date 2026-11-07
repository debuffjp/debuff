---
"create-debuff": minor
"@debuffjp/cli": patch
---

New projects' first commit credits debuff as co-author with a `Co-authored-by: debuff <353358385+debuffbot@users.noreply.github.com>` trailer, and the scaffold prints a line saying so. `--no-credit` (also on `debuff create`) leaves it out. Only the first commit carries it. That commit now skips git hooks, so a global hook can't stop a scaffold, and the branch is `main` unless `init.defaultBranch` is set.
