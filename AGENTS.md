# Agent guide

Instructions for AI agents working **on this repository**. (Agents working on a game made with debuff should use `debuff inspect`, `window.__DEBUFF_DEV__` and `debuff scenario`.)

## Orientation

- `packages/*`: browser runtime. Must stay small, tree-shakeable and free of Node APIs.
- `tooling/*`: Node CLI and scaffolder. Node APIs are fine here.
- `templates/basic`: the reference project. It's a workspace, so changes to it are built and scenario-tested by `npm run check`.
- `docs/adr/`: read the relevant ADR before changing an architectural decision.
- `.claude/skills/`: contributor skills. Use `add-package` before creating a workspace and `write-docs` for any change to public API, CLI, MCP tools or behaviour.
- `.mcp.json` connects the debuff MCP server (`tooling/mcp`) to `templates/platformer`, so agents can dogfood it. Run `npm run build` first. With `npx debuff dev` running in that template and the game open in a browser, `game_start` attaches to the live tab.

## Loop

1. State a short plan and the files you expect to touch.
2. Make the smallest change that works. Don't do broad rewrites or drive-by refactors.
3. Run `npm run check`. All of it must pass. A new git worktree needs its own `npm ci` first; `check` stops with exit 2 if packages resolve from another checkout.
4. If you changed runtime code, report the template's brotli size from the build output.
5. If a capture changed on purpose, run `npx debuff scenario --update` in `templates/basic` and explain why.

## Logs

- `docs/decisions.md`: add an entry when you make a choice that the code and the ADRs don't settle, with the options you considered.
- `docs/papercuts.md`: add an entry when a tool costs you time, with the workaround. Remove it when the cause is fixed.

## Writing

`npm run lint:prose` (part of `npm run check`) and the commit-msg hook check Markdown, comments and commit messages for the patterns below that a regular expression can find. The rules live in `scripts/lint-prose.mjs`.

- No em dashes. Use a colon, a comma, parentheses or a new sentence.
- No AI vocabulary (delve, crucial, leverage, seamless, robust, comprehensive and the rest of the list in the script) and no filler such as "it's worth noting". Say the specific thing.
- No "not just X but Y". State Y.
- Lists don't need a serial comma ("a, b and c"), matching the rest of the repo.

## Hard rules

- No new runtime dependencies without an explicit trade-off note in the PR. The direction is fewer: wrap any dependency behind our own module so callers never import it directly, and replace it with our own code when that becomes cheap.
- No dev-only code outside `import.meta.env.DEV` branches or `@debuffjp/dev`.
- Never modify source assets. Generated files (asset manifests, reports) are not committed.
- Don't make creative or art-direction decisions in templates or docs; ask instead.
- Never delete docs for something deprecated, renamed or changed in behaviour: people on old versions still look it up. Keep the old docs and mark them with the version where it changed ("Before 0.19…", "Deprecated in 0.19: use `squish`"). This covers READMEs, JSDoc, skills and the debuff.jp site, English and Japanese.
- `planning/` holds the maintainer's local planning notes. It's gitignored, so don't edit it.
