# Agent guide

Instructions for AI agents working **on this repository**. (Agents working on a game made with debuff should use `debuff inspect`, `window.__DEBUFF_DEV__` and `debuff scenario`.)

## Orientation

- `packages/*`: browser runtime. Must stay small, tree-shakeable and free of Node APIs.
- `tooling/*`: Node CLI and scaffolder. Node APIs are fine here.
- `templates/basic`: the reference project. It's a workspace, so changes to it are built and scenario-tested by `npm run check`.
- `docs/adr/`: read the relevant ADR before changing an architectural decision.
- `.mcp.json` connects the debuff MCP server (`tooling/mcp`) to `templates/platformer`, so agents can dogfood it. Run `npm run build` first. With `npx debuff dev` running in that template and the game open in a browser, `game_start` attaches to the live tab.

## Loop

1. State a short plan and the files you expect to touch.
2. Make the smallest change that works. Don't do broad rewrites or drive-by refactors.
3. Run `npm run check`. All of it must pass.
4. If you changed runtime code, report the template's brotli size from the build output.
5. If a capture changed on purpose, run `npx debuff scenario --update` in `templates/basic` and explain why.

## Hard rules

- No new runtime dependencies without an explicit trade-off note in the PR.
- No dev-only code outside `import.meta.env.DEV` branches or `@debuffjp/dev`.
- Never modify source assets. Generated files (asset manifests, reports) are not committed.
- Don't make creative or art-direction decisions in templates or docs; ask instead.
- `planning/` holds the maintainer's local planning notes. It's gitignored, so don't edit it.
