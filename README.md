<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./.github/lockup-lime.svg">
    <img src="./.github/lockup-ink.svg" width="360" alt="debuff">
  </picture>
</h1>

**more room for play.** You have a game in your head: a world to wander, a fight that feels just right, a story only you would tell. debuff is an open-source toolkit for 2D browser games that handles the basics for you (the game loop, controls, sound, levels, testing, shipping) so you get to that game sooner and spend your time on what makes it yours.

- **The groundwork, done.** Start from a running game in under a minute. Crisp pixels on every screen, keyboard, touch and gamepad, sound that plays, levels from Tiled or LDtk, and a build you can put anywhere on the web.
- **Tune it until it feels right.** Speeds, timings and other feel values become live sliders in the dev panel, with undo.
- **When something breaks, it tells you.** Errors say whose bug it is and point at the line. Replays and scenario tests bring a bug back exactly, so you can fix it and move on.
- **Room to grow.** Small (the starter ships at about 13 kB) and fast (about 200,000 sprites at 60 fps), so the engine doesn't hold your idea back.
- **Agents help if you want them, you decide.** Coding agents can play the game you have open, read what's happening and check their changes. Creative calls stay with you.

> **Status: 0.1, early development.** APIs will change, and feedback from real games shapes them.

## Try it

You need Node.js 22 or newer.

```bash
npm create debuff@latest my-game
cd my-game
npm install
npm run dev
```

Open the URL it prints, then press <kbd>`</kbd> in the game for the dev panel. Edit `src/main.ts` and the game reloads. For a tilemap platformer instead of the minimal starter, add `-- --template platformer` to the first command, or `-- --template mossfell` for a top-down adventure. pnpm, Yarn and Bun work too (`pnpm create debuff`, and so on).

New projects include a `.mcp.json`, so a coding agent like Claude Code can play and inspect the game you have open. See the [agent guide](https://debuff.jp/docs/agents).

**Working on debuff itself?** Clone the repo, then run `npm install` and `npm run build`. `cd templates/platformer && npx debuff dev` runs a template against your local packages, and the repo's `.mcp.json` points the MCP server at it. See [CONTRIBUTING](./CONTRIBUTING.md).

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

More in [Why debuff](https://debuff.jp/docs/why). Agents can start from [llms.txt](https://debuff.jp/llms.txt).

## Packages

| Package | What it does |
| --- | --- |
| [`@debuffjp/core`](./packages/core) | Game loop, fixed-step clock, seeded RNG, scenes, camera, sprites, params, storage, frame stats |
| [`@debuffjp/input`](./packages/input) | Keyboard and pointer/touch with per-step edges and programmatic input |
| [`@debuffjp/assets`](./packages/assets) | Manifest-driven loader with preload groups and actionable errors |
| [`@debuffjp/audio`](./packages/audio) | Web Audio buses, autoplay unlock, parametric synth |
| [`@debuffjp/tilemap`](./packages/tilemap) | Tilemaps: culled batched rendering, tile collision, Tiled and LDtk import |
| [`@debuffjp/juice`](./packages/juice) | Tweens, easing, pooled particles, trails, squash-and-stretch |
| [`@debuffjp/dev`](./packages/dev) | Dev panel (perf, tune, state, explained errors, replays) and `window.__DEBUFF_DEV__`, stripped from production |
| [`@debuffjp/cli`](./tooling/cli) | `debuff dev · build · assets · scenario · fuzz · inspect · report` |
| [`create-debuff`](./tooling/create-debuff) | `npm create debuff` scaffolder |
| [`@debuffjp/mcp`](./tooling/mcp) | MCP server: agents inspect, build, test and play your game |

## CLI

```text
debuff create [dir]     scaffold from a template
debuff dev              dev server, hot reload, asset manifest watching
debuff build            production build + size report (fails on dev leaks)
debuff assets           regenerate manifest, list unused assets
debuff scenario         run scenarios/*.json headless, compare captures
debuff fuzz             (next release) random playtesting; crashes come back as replay files
debuff inspect          JSON project summary for agents
debuff report           size report for an existing dist/
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
