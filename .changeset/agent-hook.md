---
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
"create-debuff": minor
---

New projects ship an agent hook (`.claude/hooks/debuff.mjs`, wired up by `.claude/settings.json` for Claude Code and `.codex/hooks.json` for Codex) that checks the agent's edits and commands as it makes them:

- It asks the human before screenshot baselines (including the MCP `run_scenarios` with `update`) or saves change.
- It refuses edits to `.debuff/`, `dist/` and `node_modules/`, a foreground `npm run dev`, and hand-changed `@debuffjp/*` versions.
- It warns about new `Math.random`, `Date.now` and real-timer lines in `src/`, which break replays and scenarios.
- Once per stop, it asks for `debuff test` when `src/` changed since the last run. `debuff test`, `debuff scenario` and the MCP `run_tests` and `run_scenarios` now record their runs in `.debuff/last-test` for this.

The rules come from the installed CLI (`@debuffjp/cli/hook`). The hook does nothing before `npm install`, and `DEBUFF_HOOK=0` turns it off. `debuff doctor` has a new advisory `agent-hooks` check, and `--fix` writes the hook files that are missing without touching existing settings. See debuff.jp/docs/agents#hook.
