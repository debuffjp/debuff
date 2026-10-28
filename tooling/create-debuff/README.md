# create-debuff

Scaffold a new [debuff](https://github.com/debuffjp/debuff) game.

```bash
npm create debuff@latest my-game
# or: pnpm create debuff · yarn create debuff · bun create debuff
```

Options:

- `--template <id>`: `basic` (default, bundled) or `platformer` (downloaded on demand), or any git source such as `github:user/repo`
- `--yes`: accept defaults without prompting (CI, agents)
- `--no-git`: don't start a git repository. By default (from 0.21) a new project is a git repository with one first commit, so every change an agent makes shows as a diff. It's skipped when git isn't installed or the folder is already inside a repository, and it never sets a git identity: without `user.name` and `user.email` it stops after `git init`.

Runs without prompts when stdin isn't a TTY.

Every new project also gets agent skills matched to this release, in `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, Gemini CLI, Cursor, Copilot), stamped with `metadata.debuff-version`. After upgrading debuff, `npx debuff doctor --fix` rewrites them (`npx debuff upgrade` does both). From 0.21 projects also get `.vscode/tasks.json`: tasks for the dev server, tests, build and doctor.
