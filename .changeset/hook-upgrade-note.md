---
"@debuffjp/cli": minor
"create-debuff": minor
---

Coding agents now hear about new debuff releases. The agent hook runs at session start too. At most once a day, when a newer debuff is out, it tells the agent the version, the changelog, and that `npx debuff upgrade` moves everything together, with an instruction to tell the human and not upgrade without their go-ahead. It reuses the CLI's daily registry check, and it's off with `DEBUFF_UPDATE_CHECK=0` and in CI.

`debuff dev` now prints the daily update hint under its banner. It never exits, so it used to never show the hint.

`debuff doctor` reports hooks from 0.23 as out of date. `--fix` now rewrites a `.claude/settings.json` or `.codex/hooks.json` that holds only debuff's hooks. It still never touches one with your own hooks or settings; in 0.23 it left every existing file alone.
