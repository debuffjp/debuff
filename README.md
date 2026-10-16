# Debuff

**More room for play.** An open-source, agent-native toolkit for small, polished 2D web games, built for game jams and instant-play distribution.

- **Web-standard.** Canvas 2D, Pointer Events, Web Audio, ES modules. No proprietary runtime, editor or project format.
- **Lean by default.** The runtime is split into tree-shakeable packages. `debuff build` reports raw/gzip/brotli size for every file and fails if dev tooling leaks into production.
- **Agent-ready, human-led.** Typed creative parameters, a dev inspection surface, and deterministic JSON scenarios with screenshot baselines. Agents get evidence, and humans keep creative control.

> Status: early development (0.x). APIs will change.

## Quick start

```bash
npm create debuff@latest my-game
cd my-game
npm install
npm run dev
```

No build step? See [using Debuff from a CDN](./docs/guides/no-build.md). Works with npm, pnpm, Yarn and Bun.

## Packages

| Package | What it does |
| --- | --- |
| [`@debuff/core`](./packages/core) | Game loop, fixed-step clock, seeded RNG, scenes, camera, sprites, params, storage, frame stats |
| [`@debuff/input`](./packages/input) | Keyboard and pointer/touch with per-step edges and programmatic input |
| [`@debuff/assets`](./packages/assets) | Manifest-driven loader with preload groups and actionable errors |
| [`@debuff/audio`](./packages/audio) | Web Audio buses, autoplay unlock, parametric synth |
| [`@debuff/juice`](./packages/juice) | Tweens, easing, pooled particles, trails, squash-and-stretch |
| [`@debuff/dev`](./packages/dev) | Dev-only inspection hooks (`window.__DEBUFF_DEV__`), stripped from production |
| [`@debuff/cli`](./tooling/cli) | `debuff dev · build · assets · scenario · inspect · report` |
| [`create-debuff`](./tooling/create-debuff) | `npm create debuff` scaffolder |

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

- [Contributing](./CONTRIBUTING.md) · [Agent guide](./AGENTS.md) · [Governance](./GOVERNANCE.md)
- [Code of conduct](./CODE_OF_CONDUCT.md) · [Security](./SECURITY.md) · [Versioning and stability](./docs/stability.md)
- [Architecture](./docs/architecture.md) · [Roadmap](./docs/roadmap.md) · [Plugins](./docs/plugins.md) · [Decisions](./docs/adr)

## License

MIT
