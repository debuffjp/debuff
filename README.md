<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/lockup-lime.svg">
    <img src="./.github/lockup-ink.svg" width="360" alt="debuff">
  </picture>
</h1>

**more room for play.** An open-source, agent-native toolkit for small, polished 2D web games, built for game jams and instant-play distribution.

- **Web-standard.** WebGL2 with a Canvas 2D fallback, Pointer Events, Gamepad, Web Audio, ES modules. No proprietary runtime, editor or project format.
- **Lean by default.** The runtime is split into tree-shakeable packages. `debuff build` reports raw/gzip/brotli size for every file and fails if dev tooling leaks into production.
- **Agent-ready, human-led.** Typed creative parameters, a dev inspection surface, and deterministic JSON scenarios with screenshot baselines. Agents get evidence, and humans keep creative control.

> Status: early development (0.x). APIs will change.

## Why not just canvas and JavaScript?

| | Raw canvas + JS | debuff |
| --- | --- | --- |
| Sprites at 60 fps | ~5,000 | **~200,000** (batched WebGL2, Canvas 2D fallback) |
| Small game, shipped | what you write | **12.9 kB** brotli for the starter, everything included |
| A crash in `update` | the loop dies silently | stops, says **whose bug it is**, links the source line |
| Tuning feel | edit, reload, replay | sliders while you play, with undo and copy back to code |
| AI agents | read code and guess | **play your game**: state, frames and errors, and you see what they did |

<p align="center">
  <img src="https://raw.githubusercontent.com/debuffjp/docs/main/public/shots/bench.svg" width="640" alt="Sprites at 60 fps: debuff WebGL2 200k, PixiJS ParticleContainer 200k, PixiJS Sprite 50k, Canvas 2D 5k">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/debuffjp/docs/main/public/shots/dev-error.png" width="300" alt="The dev panel explaining an error: your code, the source line and a hint">
  <img src="https://raw.githubusercontent.com/debuffjp/docs/main/public/shots/dev-tune.png" width="300" alt="The dev panel's tune tab with live sliders">
</p>

More in [Why debuff](https://debuff.jp/guide/why). Agents can start from [llms.txt](https://debuff.jp/llms.txt).

## Quick start

```bash
npm create debuff@latest my-game                          # minimal starter
npm create debuff@latest my-game -- --template platformer # tilemap platformer
cd my-game
npm install
npm run dev
```

No build step? See [using debuff from a CDN](./docs/guides/no-build.md). Works with npm, pnpm, Yarn and Bun.

## Packages

| Package | What it does |
| --- | --- |
| [`@debuff/core`](./packages/core) | Game loop, fixed-step clock, seeded RNG, scenes, camera, sprites, params, storage, frame stats |
| [`@debuff/input`](./packages/input) | Keyboard and pointer/touch with per-step edges and programmatic input |
| [`@debuff/assets`](./packages/assets) | Manifest-driven loader with preload groups and actionable errors |
| [`@debuff/audio`](./packages/audio) | Web Audio buses, autoplay unlock, parametric synth |
| [`@debuff/tilemap`](./packages/tilemap) | Tilemaps: culled batched rendering, tile collision, Tiled and LDtk import |
| [`@debuff/juice`](./packages/juice) | Tweens, easing, pooled particles, trails, squash-and-stretch |
| [`@debuff/dev`](./packages/dev) | Dev panel (perf, tune, state, explained errors) and `window.__DEBUFF_DEV__`, stripped from production |
| [`@debuff/cli`](./tooling/cli) | `debuff dev · build · assets · scenario · inspect · report` |
| [`create-debuff`](./tooling/create-debuff) | `npm create debuff` scaffolder |
| [`@debuff/mcp`](./tooling/mcp) | MCP server: agents inspect, build, test and play your game |

## CLI

```text
debuff create [dir]     scaffold from a template
debuff dev              dev server, hot reload, asset manifest watching
debuff build            production build + size report (fails on dev leaks)
debuff assets           regenerate manifest, list unused assets
debuff scenario         run scenarios/*.json headless, compare captures
debuff inspect          JSON project summary for agents
```

Every command accepts `--json` for machine-readable output where applicable.

## Repository layout

```text
packages/    browser runtime libraries (@debuff/*)
tooling/     Node-side tools (CLI, scaffolder)
templates/   starter templates; built and scenario-tested in CI
docs/        architecture, roadmap, decisions (docs/adr)
```

## Community

- [debuff.jp](https://debuff.jp) · [Forums](https://forums.debuff.jp)
- [Contributing](./CONTRIBUTING.md) · [Agent guide](./AGENTS.md) · [Governance](./GOVERNANCE.md)
- [Code of conduct](./CODE_OF_CONDUCT.md) · [Security](./SECURITY.md) · [Versioning and stability](./docs/stability.md)
- [Architecture](./docs/architecture.md) · [Roadmap](./docs/roadmap.md) · [Plugins](./docs/plugins.md) · [Decisions](./docs/adr)

## License

MIT
