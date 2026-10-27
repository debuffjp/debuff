# create-debuff

Scaffold a new [debuff](https://github.com/debuffjp/debuff) game.

```bash
npm create debuff@latest my-game
# or: pnpm create debuff · yarn create debuff · bun create debuff
```

Options:

- `--template <id>`: `basic` (default, bundled) or `platformer` (downloaded on demand), or any git source such as `github:user/repo`
- `--yes`: accept defaults without prompting (CI, agents)

Runs without prompts when stdin isn't a TTY.

Every new project also gets agent skills matched to this release, in `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, Gemini CLI, Cursor, Copilot), stamped with `metadata.debuff-version`. After upgrading debuff, `npx debuff doctor --fix` rewrites them.
