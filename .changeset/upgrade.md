---
"@debuffjp/cli": minor
---

`debuff upgrade` moves every debuff package to the latest release together (or `--to <version>`), keeping each range's style, installs with the project's package manager, then runs the new version's `doctor --fix`, which rewrites the agent skills for it. `--dry-run` shows the plan; it never downgrades without `--to`. `debuff doctor` now says when a newer debuff is out, and once a day the CLI prints one line on stderr when there is one (never with `--json`; off in CI and with `DEBUFF_UPDATE_CHECK=0`).
