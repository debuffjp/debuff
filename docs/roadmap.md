# Roadmap

A living document. Items move up only with evidence from real games, jams and first-run tests.

**Status:** 0.22 is on npm (`npm create debuff@latest`), spryte 0.7.2 is on npm, and [debuff.jp](https://debuff.jp) is live. Last reassessed 2026-10-29, against what the dogfooding games (burrowball, conveyor, gloop, overbuffed) had to write themselves.

## Up next (in order)

Evidence for each item is what our own games hand-rolled. Nothing here comes from issue requests yet: the repos have none, so the order will change as people use debuff.

1. **First-run fixes.** Run the agent first-run test (a fresh agent goes from debuff.jp to a playable game), then fix every blocker it finds before anything else.
2. **Smooth rendering between fixed steps.** `render` already gets the leftover `alpha`, but three games each wrote their own previous-position bookkeeping and lerp. A small opt-in helper for that. Evidence: overbuffed, conveyor, burrowball.
3. **Spatial hash.** A uniform grid for "what's near this" queries (enemies, bullets, turret ranges), deterministic and allocation-free, next to `overlaps` and `circlesOverlap` in core. Evidence: overbuffed's hand-rolled grid, conveyor's plan.
4. **On-screen touch controls.** A virtual stick and buttons that feed the same actions as keys and pads, testable headlessly. Evidence: conveyor, burrowball, overbuffed's mobile notes.
5. **Word wrap.** `draw.text` wrapped to a width in spryte, used by `ui`. Evidence: conveyor's hand-written wrap, and the spryte gap below.
6. **Pixel buffers as textures.** Draw an `ImageData`-style buffer and re-upload only its changed rectangle. Evidence: burrowball (two friction entries); it also lowers the upload cost the renderer research found.
7. **`debuff publish`.** `debuff ship` covers itch.io today; static web hosts and desktop through Tauri remain. Size budget enforced.
8. **Plugin phase 2b.** `sheet` manifest entries, per-frame durations, and JSON Schemas for the manifest, `SourceFile` and `ImportResult`, with contract tests (ADR 0005). Before 2026-10-29 this item led with `@debuffjp/plugin-aseprite` as the reference importer; that importer is no longer planned for now (grid sheets already load through `name@WxH.png` and are atlased at build time, and the house art pipeline is tenten), so the contract tests will use an importer that exists.
9. **SEO and agent discovery, phase 2.** Comparison pages, recipes, the jam kit and a showcase. A reviewed, machine-readable list of plugins and community projects that debuff.jp, the MCP server and the agent skill all read. Registry listings: MCP registries, npm keywords, awesome lists.

Done since the 0.1 list:

- [x] **Releases from CI** (was item 2): npm trusted publishing with provenance from the release workflow.
- [x] **Deterministic replays** (was item 3): see *Differentiators*.

Considered, not scheduled until a game needs it: localisation, a dialogue runner (likely an inkjs adapter), rigid-body physics (likely a planck adapter), grid pathfinding and seeded noise (one game plans them). Each would follow the same rules: seeded through `Random`, stepped on the fixed clock, opt-in.

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
- [x] Templates: basic (bundled) and platformer (downloaded on demand); since then isometric, mossfell, pointclick, sidescroller, squish and topdown
- [x] debuff.jp: guides, API reference, `llms.txt` and `llms-full.txt`, sitemap, structured data, playable plinko demo
- [x] Desktop builds with Tauri (guide; tested on Windows)

## Differentiators: what makes debuff the obvious choice

Proposals, ordered by payoff for the effort. Each builds on something debuff already has (a fixed-step clock, seeded RNG, scenarios, explained errors, the MCP server) that PixiJS (a renderer, not a game loop) and raw canvas don't.

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

What stops spryte replacing PixiJS's renderer in a typical game today, as of 0.7.2 (first written for 0.2.1). Each item gets an immediate-mode design (opt-in, tree-shakeable, no retained objects), pixel-checked tests, and a 2dbench scene where it touches performance. Order follows demand.

- [ ] **Interaction.** `draw.pick` (above).
- [x] **Optional features stay out of the core.** Shapes, masks, filters, `nineSlice` and `tiled` are imported functions taking the `Draw`, so startup stays at 12.7 kB unless they're used (11.3 kB before 0.7.2).
- [x] **Vector shapes.** `polygon`, `polyline`, `roundRect` and `ring`, antialiased on WebGL2 by a one-pixel feather (no MSAA). Curves are points you compute; holes aren't supported.
- [x] **Blend modes.** `normal`, `add`, `multiply`, `screen` and `erase`, one `blendFunc` each.
- [x] **Masks.** `mask(draw, shape, fn)`: mask by anything you can draw, soft edges included.
- [x] **Filters.** `filter(draw, [blur(4), grayscale()], fn)` chains passes; colour filters match CSS on Canvas 2D. Glow is a recipe (additive blurred copy). Displacement stays a custom shader.
- [ ] **Text layout.** Today: CSS and bitmap fonts, `align`, `baseline`, line breaks and `measure`. Missing: word wrap to a width, and mixed styles in one string.
- [x] **Sprite variants.** `nineSlice` (UI panels) and `tiled` (repeating fills that work inside atlases). Meshes and ropes are left out of scope.
- [ ] **Sheets and animation.** Loading texture atlases (Aseprite and TexturePacker JSON) into frames, and a small frame-animation helper. debuff's asset pipeline covers this for debuff games; standalone spryte users write their own today. Lower priority since 2026-10-29: no user has asked for it yet.
- [ ] **Accessibility.** A pattern or helper for exposing canvas content to screen readers (PixiJS has an accessibility plugin).
- [ ] **Migration tooling.** More of the [migration guide](https://debuff.jp/spryte/migrating-from-pixijs) as runnable examples, and side-by-side ports of common PixiJS examples.
- [ ] **WebGPU backend.** Only if it beats WebGL2 on 2dbench; PixiJS's WebGPU renderer is slower than its WebGL one there today. A test port (2026-10-28) drew identical pixels but was no faster on one-call-per-sprite drawing; what it found (the transform maths) shipped on WebGL2 in 0.7.2 instead. Worth revisiting for static layers (render bundles) and GPU particles (compute), which need new opt-in APIs rather than a second backend.

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
