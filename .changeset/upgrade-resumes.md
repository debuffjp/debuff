---
"@debuffjp/cli": patch
---

`debuff upgrade` finishes an upgrade whose install failed or was interrupted. Before, package.json was already on the new version, so a rerun said "already on" and exited 0, leaving the old packages and agent skills installed. It now compares what's in `node_modules` with package.json, then installs and runs the new version's `doctor --fix` when they differ. `--json` lists those packages as `stale`.
