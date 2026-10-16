# ADR 0005: Toolchain strategy: orchestrate, don't rebuild; contracts are the core

- Status: accepted
- Date: 2026-10-16

## Question

Should debuff build its own toolchain (bundler, dev server, asset processing), possibly in another language such as Rust or Go, as a separate project? Would that make the core stronger?

## Context

- Bundling and dev serving are solved, fast and well-maintained problems. Vite 8 runs on Rolldown and Oxc, which are written in Rust. The JS ecosystem already gets native speed there, maintained by large teams.
- debuff's differentiators aren't bundling. They are game-aware assets, size and boundary enforcement, deterministic scenarios, typed creative parameters and the agent surface.
- Asset processing is where a native tool could pay off: image quantisation and packing, audio transcoding, large batches. Mature native libraries already exist (libvips, oxipng, ffmpeg).
- Contributors and users write TypeScript. Tooling in a second language narrows who can contribute to it.

## Options

| Option | Upside | Cost |
| --- | --- | --- |
| **A. Own bundler/dev server** (any language) | Full control | Years of work duplicating Vite/Rolldown. Splits the ecosystem, since Vite plugins wouldn't work. High maintenance |
| **B. Native "debuff toolchain" binary** wrapping everything | Single fast binary, language freedom | Every feature crosses a process or language boundary. Harder to contribute. Plugins need FFI or a protocol |
| **C. TypeScript orchestration over best-in-class tools** (current) | Fast to build, one language with users, Vite plugin ecosystem for free | Speed is bounded by the underlying tools (already native) |
| **D. C, plus stable data contracts and optional native workers** | C's benefits. Any language can implement a tool against the contracts. Hot paths go native only when measured | Contracts must be versioned and kept stable |

## Recommendation: D

1. **Don't build a bundler or dev server.** Stay on Vite. The debuff Vite plugin is the integration point.
2. **Make the contracts the core.** Publish versioned JSON Schemas for:
   - the asset manifest (`version: 1`)
   - the build report (`debuff-report.json`)
   - scenarios (already published)
   - the dev hooks surface (`DevHooks.version`)
   - the plugin manifest (ADR 0004)

   Any tool in any language that reads and writes these is a first-class debuff tool. This is what strengthens the core: the runtime and contracts stay small and stable while tooling competes and evolves around them.
3. **Allow native workers where measurement justifies them.** Asset importers can be external processes speaking a small JSON-over-stdio protocol (ADR 0004). A future Rust asset processor can then ship as its own project without the CLI depending on it.
4. **Repos in the GitHub org:**
   - `debuff`: runtime packages, CLI, scaffolder, templates, schemas (this repo). They change together while the APIs are moving. Splitting now would turn every API change into a coordinated multi-repo release.
   - Separate repos from day one, because they have independent cadences: `docs`, `jams`, `examples`, `assets`, community plugins.
   - Revisit splitting the CLI out at 1.0, or when a native toolchain project exists. The package boundaries already allow it: runtime packages never import tooling.

## Consequences

- We spend effort on what makes debuff different, not on infrastructure others maintain better.
- Contract schemas become public API (see `docs/stability.md`) and need tests that validate real outputs against them.
- A native asset processor stays possible and is easy to plug in, but is only built when a benchmark shows the need.
