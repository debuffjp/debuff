# Roadmap

A living document. Items move up only with evidence from real games, jams and first-run tests.

**Status:** 0.1 is on npm (`npm create debuff@latest`), and [debuff.jp](https://debuff.jp) is live.

## Up next (in order)

1. **First-run fixes.** Run the agent first-run test (a fresh agent goes from debuff.jp to a playable game), then fix every blocker it finds before anything else.
2. **Releases from CI.** npm trusted publishing with provenance from the release workflow, so publishes no longer need local 2FA or manual staging approval.
3. **Deterministic replays.** Record a session's inputs plus its seed, then replay it exactly, scrub through it in the dev panel and attach it to bug reports. (See *Differentiators*.)
4. **`debuff publish`.** One command to ship: itch.io (via butler), static web hosts, and desktop through Tauri. Size budget enforced.
5. **Finish plugin phase 2b.** `@debuffjp/plugin-aseprite` as the reference importer, `sheet` manifest entries, per-frame durations, and JSON Schemas for the manifest, `SourceFile` and `ImportResult`, with contract tests (ADR 0005).
6. **SEO and agent discovery, phase 2.** Comparison pages, recipes, the jam kit and a showcase. Registry listings: MCP registries, npm keywords, awesome lists.

## Done in 0.1

- [x] Runtime: fixed-step loop, scenes, camera, sprites, input (keys, pointer, touch, gamepad, action bindings), audio, juice, storage, params, reduced motion
- [x] Batched WebGL2 renderer with a Canvas 2D fallback (ADR 0007), now the standalone [spryte](../packages/spryte) package (ADR 0013): bulk `draw.sprites`, render targets, custom shaders, 2-4x PixiJS on the benchmark; `draw.clip`; recovers from GPU context loss
- [x] Assets: generated manifest, automatic atlas packing, only referenced files ship
- [x] Tilemaps: culled rendering, solid and one-way collision with landing tolerance, Tiled and LDtk import
- [x] Loop errors stop cleanly instead of freezing (`hooks.error`, `game.lastError`)
- [x] Dev panel (`@debuffjp/dev`): perf (dropped-frame causes, headroom), tune (live params with undo), state, log (explained, source-mapped errors), pause, step and slow motion
- [x] CLI: create, dev, build with size report and dev-leak check, assets, scenario, inspect
- [x] Deterministic scenarios with screenshot baselines
- [x] MCP server (`@debuffjp/mcp`): project tools, live attach to the open game, notes, frames, explained errors, workflow prompts
- [x] New projects ship `AGENTS.md`, `CLAUDE.md` and `.mcp.json`
- [x] "Made with debuff" splash (any input skips it, `splash: false` removes it)
- [x] Plugins: runtime contract; `debuff.config.ts`, asset importers, CLI commands, scenario steps; templates from git
- [x] Templates: basic (bundled) and platformer (downloaded on demand)
- [x] debuff.jp: guides, API reference, `llms.txt` and `llms-full.txt`, sitemap, structured data, playable plinko demo
- [x] Desktop builds with Tauri (guide; tested on Windows)

## Differentiators: what makes debuff the obvious choice

Proposals, ordered by leverage. Each builds on something debuff already has (a fixed-step clock, seeded RNG, scenarios, explained errors, the MCP server) that PixiJS (a renderer, not a game loop) and raw canvas don't.

- [x] **Deterministic replays and time travel.** Recording, save/copy, rewind and scrub in the dev panel, save as scenario, and `game_replay` / `game_rewind` for agents. Inputs plus seed are a complete recording. Rewind and scrub in the dev panel, share a replay file that reproduces a bug exactly, and turn any replay into a scenario.
- [x] **Fuzz playtesting.** `debuff fuzz` drives random and biased inputs headlessly for N minutes, and reports explained errors and stuck states, each with a replay file. It works in CI, and agents can use it via MCP.
- [x] **Accessibility checks in scenarios.** `flashes` and `contrast` steps and `reducedMotion` scenarios (red flashes still to do). Flash safety (frame-to-frame luminance, following WCAG 2.3.1's limit of three flashes a second), contrast of key UI against the background, reduced-motion coverage. Most engines don't ship this, and it's cheap given the scenario runner.
- [x] **State-preserving hot reload.** Edit your code and keep your place: `debuff dev` replays the session's inputs with the new code to the tick you were on, so tuning a boss fight doesn't mean playing back to it.
- [ ] **Scenario recording from live play.** Play a sequence, save it as a scenario with captures.
- [ ] **Change reports.** For any change (yours or an agent's): files, params, size delta, before and after captures.

## spryte

spryte stays immediate mode: no scene graph, nothing retained between frames. Where people need more than drawing, we build approaches designed for that model, opt-in and tree-shakeable, rather than porting retained-mode systems.

- [ ] **Interaction and hit-testing.** An opt-in `draw.pick(x, y)`: tag what you draw with an `id`, and spryte returns the topmost tagged sprite under a point from the last frame, respecting transforms and clips. Untagged drawing costs nothing. Dispatch (hover, press, drag) stays with the app, or with debuff's input layer. Until then, keep your objects' bounds and test the pointer against them, topmost first.
- [ ] Driven by launch feedback: features people ask for, non-game examples (data viz, generative art, maps), and migration help from other renderers.

### Gaps against PixiJS

What stops spryte replacing PixiJS's renderer in a typical game today, as of 0.2.1. Each item gets an immediate-mode design (opt-in, tree-shakeable, no retained objects), pixel-checked tests, and a 2dbench scene where it touches performance. Order follows demand.

- [ ] **Interaction.** `draw.pick` (above).
- [x] **Optional features stay out of the core.** Shapes, masks, filters, `nineSlice` and `tiled` are imported functions taking the `Draw`, so startup stays at 11.3 kB unless they're used.
- [x] **Vector shapes.** `polygon`, `polyline`, `roundRect` and `ring`, antialiased on WebGL2 by a one-pixel feather (no MSAA). Curves are points you compute; holes aren't supported.
- [x] **Blend modes.** `normal`, `add`, `multiply`, `screen` and `erase`, one `blendFunc` each.
- [x] **Masks.** `mask(draw, shape, fn)`: mask by anything you can draw, soft edges included.
- [x] **Filters.** `filter(draw, [blur(4), grayscale()], fn)` chains passes; colour filters match CSS on Canvas 2D. Glow is a recipe (additive blurred copy). Displacement stays a custom shader.
- [ ] **Text layout.** Today: CSS and bitmap fonts, `align`, `baseline`, line breaks and `measure`. Missing: word wrap to a width, and mixed styles in one string.
- [x] **Sprite variants.** `nineSlice` (UI panels) and `tiled` (repeating fills that work inside atlases). Meshes and ropes are left out of scope.
- [ ] **Sheets and animation.** Loading texture atlases (Aseprite and TexturePacker JSON) into frames, and a small frame-animation helper. debuff's asset pipeline covers this for debuff games; standalone spryte users write their own today.
- [ ] **Accessibility.** A pattern or helper for exposing canvas content to screen readers (PixiJS has an accessibility plugin).
- [ ] **Migration tooling.** More of the [migration guide](https://debuff.jp/spryte/migrating-from-pixijs) as runnable examples, and side-by-side ports of common PixiJS examples.
- [ ] **WebGPU backend.** Only if it beats WebGL2 on 2dbench; PixiJS's WebGPU renderer is slower than its WebGL one there today.

Not planned, by design: a scene graph or display-object tree, nested containers with inherited transforms, and an event system that hangs handlers on retained objects. Those are what make per-sprite cost high; spryte's answer is the immediate-mode equivalents above.

## Later: performance and reach

- [ ] OffscreenCanvas and worker rendering experiment
- [ ] Platform adapters (itch.io, Wavedash, Poki, CrazyGames…) as optional packages
- [ ] Audio compression and image optimisation policies in the asset compiler
- [ ] `debuff params` presets as files, with diffable before and after captures
- [ ] Desktop: verify macOS and Linux, then a `debuff desktop` command

## Community

- [x] Project site and docs: [debuff.jp](https://debuff.jp)
- [x] Community home: [Discord](https://discord.gg/jshbDHSpCY)
- [ ] Forums (forums.debuff.jp): in progress
- [ ] Jam kit: template, itch page, "made with debuff" badge
- [ ] More templates (top-down, arcade), kept tiny
- [ ] Private jam, then a first open jam
- [ ] Showcase of community games

## Separate repositories

Keep this repo slim. These live elsewhere:

| Repo | Purpose |
| --- | --- |
| `debuffjp/docs` | debuff.jp: guides, API reference, examples like plinko |
| `debuffjp/brand` | Foundation mark, wordmark, buff, social card |
| `debuffjp/jams` | Jam site, rules, submissions (when needed) |
| `debuffjp/assets` | CC0 starter art and audio packs (when needed) |
| `debuff-plugin-*` | Community extensions (npm naming convention) |

## Not planned

Visual editor, 3D, mandatory cloud services, proprietary project format, telemetry in games or tools.
