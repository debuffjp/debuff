# Roadmap

A living document. Items move up only with evidence from real games and jam feedback.

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
- [ ] Aseprite JSON import (frames, tags → animations)

## Plugins (ADR 0004)

- [x] Phase 1: runtime contract (`game.use`, `game.hooks`, `game.inspect`)
- [ ] Phase 2: `debuff.config.ts`, asset importers (in-process and stdio), `@debuff/plugin-aseprite`
- [ ] Phase 3: plugin CLI commands (`debuff name:cmd`) and scenario steps
- [ ] Phase 4: templates from git/npm

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
| `debuff-docs` | Docs site and tutorials |
| `debuff-jams` | Jam site, rules, submissions |
| `debuff-examples` | Full example and benchmark games |
| `debuff-assets` | CC0 starter art and audio packs |
| `debuff-plugin-*` | Community extensions (naming convention) |

## Not planned

Visual editor, 3D, mandatory cloud services, proprietary project format.
