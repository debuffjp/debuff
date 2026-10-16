# ADR 0002: Monorepo layout and tooling

- Status: accepted
- Date: 2026-10-16

## Decision

- One npm-workspaces monorepo: `packages/` (browser runtime), `tooling/` (Node), `templates/` (starter projects as workspaces).
- No example games in this repo. Templates are the reference projects and stay tiny. Larger games go in a separate `debuff-examples` repo.
- TypeScript project references for builds, Vite for dev/bundling, Vitest for unit tests, Biome for lint and format, Changesets for fixed-version releases.
- CLI UX: `cac` (arguments), `@clack/prompts` (interactive TUI), `picocolors` (colour). Every command keeps a `--json` mode for agents.
- Browser automation uses `playwright-core` with the system Chrome/Edge, so contributors and CI don't need a separate browser download.

## Why

npm workspaces need no extra tool. Each of these dependencies is small, popular and replaceable. Fixed versioning keeps compatibility simple while the API is still moving.
