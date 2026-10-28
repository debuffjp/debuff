---
"create-debuff": minor
"@debuffjp/cli": patch
---

New projects start as a git repository with one first commit, so every change an agent makes shows as a diff to review or undo. `--no-git` (also on `debuff create`) turns it off; it's skipped when git isn't installed or the folder is already inside a repository, and it never sets a git identity. Projects also get `.vscode/tasks.json` with tasks for the dev server, tests, build and doctor.
