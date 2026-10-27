# Contributing to debuff

Thanks for helping. Small, focused changes backed by a real need (a game, a jam entry, a measured problem) land fastest. Questions and ideas are welcome on [Discord](https://discord.gg/jshbDHSpCY) before you open a PR.

## Setup

```bash
npm install
npm run check   # lint, typecheck, unit tests, builds, browser scenarios
```

`npm install` also installs git hooks ([lefthook](https://lefthook.dev)): staged files are formatted on commit, and typecheck plus unit tests run on push. That keeps CI lean: one Linux job per push. `npm run test:package-manager <npm|pnpm|yarn|bun>` scaffolds and builds a project with each package manager.

Scenarios need Chrome or Edge installed. Set `DEBUFF_BROWSER=/path/to/chromium` to use another browser.

## Everyday commands

| Command | Purpose |
| --- | --- |
| `npm run format` | Biome format + safe lint fixes |
| `npm test` | Vitest unit tests |
| `npm run build` | Build all packages and the templates |
| `npm run test:scenarios` | Run template scenarios in a headless browser |
| `npm run changeset` | Describe a user-facing change for the next release |

To try the CLI against the template: `cd templates/basic && npx debuff dev`.

## Principles for changes

1. **Web standards first.** Prefer platform APIs over dependencies. Add a dependency only when it clearly saves effort, and explain the trade-off in the PR.
2. **Pay only for what you use.** Runtime packages must stay tree-shakeable (`"sideEffects": false`, no import-time work). Put optional features in their own module or package.
3. **Measure before claiming.** Include `debuff build` size output for runtime changes. Don't claim performance wins without numbers.
4. **Dev never ships.** Dev-only code lives behind `import.meta.env.DEV`; the build fails if it leaks.
5. **Explicit over clever.** Use named options, stable IDs and actionable error messages. No hidden global state.
6. **Humans own creative decisions.** Tools may suggest; they never silently change assets, mechanics or art direction.

## Decisions

Significant choices are recorded in `docs/adr/`. To propose a change in direction, open an issue or add a new ADR in your PR.

## Releases

[Changesets](https://github.com/changesets/changesets) manages versions. All `@debuffjp/*` packages and `create-debuff` share one version. Merging the bot's "Version packages" PR publishes to npm.
