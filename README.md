<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/lockup-lime.svg">
    <img src="./.github/lockup-ink.svg" width="360" alt="debuff">
  </picture>
</h1>

**more room for play.** debuff is an open-source toolkit for small, polished 2D games that run in the browser. It takes care of the setup and plumbing, so you spend your time on mechanics, art and weird ideas, with or without a coding agent.

- **Small and fast.** About 200,000 sprites at 60 fps on batched WebGL2 (with a Canvas 2D fallback), and the starter game ships at about 13 kB brotli.
- **Dev tools that explain things.** Errors say whose bug it is and link the exact source line. Dropped frames say whether your code caused them. Feel values become live sliders you can undo.
- **Agents help, you decide.** An MCP server lets coding agents play the game you have open, read state, frames and errors, and verify changes with deterministic screenshot tests. Everything they do shows in your dev panel.
- **Web standards only.** ES modules, a canvas, Pointer Events, Gamepad and Web Audio. No proprietary runtime, editor or project format.

> **Status: early development (0.x).** The packages aren't on npm yet, so run debuff from source (below). APIs will change.

## Try it

You need Node.js 22 or newer and git. These steps are tested from a fresh clone (on Node 24) and take about a minute and a half:

```bash
git clone https://github.com/debuffjp/debuff
cd debuff
npm install
npm run build
cd templates/platformer   # or templates/basic for a minimal starter
npx debuff dev
```

Open the URL it prints, then press <kbd>`</kbd> in the game for the dev panel. Edit `src/main.ts` and the game reloads.

Once the packages are published, `npm create debuff@latest my-game` will scaffold a standalone project.

**With a coding agent:** the repo's `.mcp.json` connects the debuff MCP server to the platformer, so an agent like Claude Code can play and inspect the game you have open. See the [agent guide](https://debuff.jp/guide/agents).

## Why not just canvas and JavaScript?

| | Raw canvas + JS | debuff |
| --- | --- | --- |
| Sprites at 60 fps | ~5,000 | **~200,000** (batched WebGL2, Canvas 2D fallback) |
| Small game, shipped | what you write | **~13 kB** brotli for the starter, everything included |
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

## Packages

| Package | What it does |
| --- | --- |
| [`@debuffjp/core`](./packages/core) | Game loop, fixed-step clock, seeded RNG, scenes, camera, sprites, params, storage, frame stats |
| [`@debuffjp/input`](./packages/input) | Keyboard and pointer/touch with per-step edges and programmatic input |
| [`@debuffjp/assets`](./packages/assets) | Manifest-driven loader with preload groups and actionable errors |
| [`@debuffjp/audio`](./packages/audio) | Web Audio buses, autoplay unlock, parametric synth |
| [`@debuffjp/tilemap`](./packages/tilemap) | Tilemaps: culled batched rendering, tile collision, Tiled and LDtk import |
| [`@debuffjp/juice`](./packages/juice) | Tweens, easing, pooled particles, trails, squash-and-stretch |
| [`@debuffjp/dev`](./packages/dev) | Dev panel (perf, tune, state, explained errors) and `window.__DEBUFF_DEV__`, stripped from production |
| [`@debuffjp/cli`](./tooling/cli) | `debuff dev · build · assets · scenario · inspect · report` |
| [`create-debuff`](./tooling/create-debuff) | `npm create debuff` scaffolder |
| [`@debuffjp/mcp`](./tooling/mcp) | MCP server: agents inspect, build, test and play your game |

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
packages/    browser runtime libraries (@debuffjp/*)
tooling/     Node-side tools (CLI, scaffolder)
templates/   starter templates; built and scenario-tested in CI
docs/        architecture, roadmap, decisions (docs/adr)
```

## Community

- [debuff.jp](https://debuff.jp) · [Issues](https://github.com/debuffjp/debuff/issues)
- [Contributing](./CONTRIBUTING.md) · [Agent guide](./AGENTS.md) · [Governance](./GOVERNANCE.md)
- [Code of conduct](./CODE_OF_CONDUCT.md) · [Security](./SECURITY.md) · [Versioning and stability](./docs/stability.md)
- [Architecture](./docs/architecture.md) · [Roadmap](./docs/roadmap.md) · [Plugins](./docs/plugins.md) · [Decisions](./docs/adr)

## License

MIT
