# Roadmap

A living document. Items move up only with evidence from real games and jam feedback.

## Up next (in order)

1. **Finish plugin phase 2.** `@debuff/plugin-aseprite` as the reference importer, `sheet` manifest entries, `assets.sheet(id)`, per-frame animation durations. Publish JSON Schemas for the manifest, `SourceFile` and `ImportResult`, with contract tests (ADR 0005).
2. ~~**Package-manager and distribution breadth.**~~ Done: CI proves npm, pnpm, Yarn and Bun; [no-build guide](./guides/no-build.md); JSR deferred (ADR 0006).
3. **First release (0.1.0).** Confirm the npm scope, add the `NPM_TOKEN` secret with provenance, merge the Changesets release PR.
4. **Dev overlay plugin.** FPS/frame-time graph and live param sliders in the browser; the first thing people see.
5. **Docs site** (`debuffjp/docs`). Guides, generated API reference, runnable examples.
6. **Plugin phases 3–4.** CLI commands, scenario steps, templates from git/npm.
7. **MCP adapter** over the CLI and dev hooks.
8. ~~**Renderer benchmark.**~~ Done: ADR 0007. The `draw` API runs on batched WebGL2 (~200k sprites at 60 fps) with a Canvas 2D fallback.

## Now: foundation (0.x)

- [x] Runtime: loop, scenes, camera, sprites, input, audio, juice, storage, params
- [x] Responsive, DPR-aware Canvas 2D with pixel-perfect mode
- [x] CLI: create, dev, build + size report, assets, scenario, inspect
- [x] Deterministic scenarios with screenshot baselines
- [x] CI matrix, Changesets releases
- [ ] First npm release (naming/registry check first)
- [ ] Dev overlay: FPS/frame-time graph, live param sliders (`@debuff/dev`)
- [x] Action-mapped input with gamepad support (Gamepad API)
- [ ] Tilemaps (Tiled/LDtk import) and an atlas packer in the asset compiler

## Plugins (ADR 0004)

- [x] Phase 1: runtime contract (`game.use`, `game.hooks`, `game.inspect`)
- [x] Phase 2a: `debuff.config.ts`, asset importers (in-process and stdio), in-memory manifest
- [ ] Phase 2b: `@debuff/plugin-aseprite`, sheet entries, contract schemas
- [x] Phase 3: plugin CLI commands (`debuff name:cmd`) and scenario steps
- [x] Phase 4: templates from git (npm-hosted templates deferred)

## Next: agent workflow

- [ ] MCP adapter over the CLI and dev hooks
- [ ] `debuff params` to read/write param presets as files, with diffable before/after captures
- [ ] Scenario recording from live play
- [ ] Change reports: files, params, size delta, captures

## Later: performance and reach

- [ ] Renderer benchmark: Canvas 2D vs a WebGL2 batcher on representative scenes (ADR to follow)
- [ ] Optional WebGL2 sprite batcher and filters as a separate package
- [ ] OffscreenCanvas/worker rendering experiment
- [ ] Platform adapters (itch.io, Wavedash, Poki, CrazyGames…) as optional packages
- [ ] Audio compression and image optimisation policies in the asset compiler

## Community

- [ ] Docs site
- [ ] More templates (platformer, top-down, arcade) kept tiny
- [ ] Private jam, then first open jam
- [ ] Showcase of community games

## Separate repositories (when needed)

Keep this repo slim. These belong elsewhere:

| Repo | Purpose |
| --- | --- |
| `debuffjp/docs` | Docs site and tutorials |
| `debuffjp/jams` | Jam site, rules, submissions |
| `debuffjp/examples` | Full example and benchmark games |
| `debuffjp/assets` | CC0 starter art and audio packs |
| `debuff-plugin-*` | Community extensions (npm naming convention) |

## Not planned

Visual editor, 3D, mandatory cloud services, proprietary project format.
