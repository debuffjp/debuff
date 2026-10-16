# ADR 0006: Distribution: npm registry, any package manager, CDN; JSR deferred

- Status: accepted
- Date: 2026-10-16

## Context

We want maximum reach without locking users into one tool. Three separate things are often all called "npm":

1. **The registry**, where packages are published.
2. **The client** users install with.
3. **The client** contributors use in this monorepo.

## Decision

- **Registry: npm.** It's the source every JavaScript package manager reads from (npm, pnpm, Yarn, Bun, Deno via `npm:` specifiers), and CDNs (jsDelivr, esm.sh, unpkg) serve npm packages to browsers with no build step. Publishing anywhere else first would shrink our reach.
- **User clients: all of them, proven in CI.** `scripts/smoke-package-manager.mjs` packs every package, scaffolds with `create-debuff`, installs, builds and runs scenarios with npm, pnpm, Yarn and Bun. Strict installers (pnpm) catch undeclared dependencies that npm's hoisting hides.
- **No-build use: documented** (`docs/guides/no-build.md`) via import maps and CDNs, because the runtime packages are dependency-free ESM.
- **Contributor client: npm workspaces**, the zero-install default. Revisit pnpm if install time or dependency strictness becomes a problem; the switch is mechanical.
- **JSR: deferred.** JSR publishes TypeScript source with good Deno and Bun ergonomics, but Deno and Bun already consume our npm packages. Dual publishing adds a second release pipeline and "no slow types" constraints for little extra reach today. Revisit if users ask for it or JSR adoption shifts. The runtime packages already use explicit types and no dependencies, so publishing there later is cheap.

## Consequences

- One release pipeline (Changesets → npm with provenance).
- Package-manager compatibility is a tested guarantee, not a hope.
- Templates must declare every dependency they use. The pnpm job enforces it.
