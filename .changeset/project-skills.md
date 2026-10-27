---
"create-debuff": minor
"@debuffjp/cli": minor
---

New projects carry agent skills for their own debuff version: `npm create debuff` writes the `debuff`, `debuff-setup`, `keiko` and `myaku` skills into `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, Gemini CLI, Cursor, Copilot), each stamped with `metadata.debuff-version`. `debuff doctor` flags missing or stale skills, and `--fix` rewrites them for the installed version, so an agent's instructions match the code it edits after an upgrade.
