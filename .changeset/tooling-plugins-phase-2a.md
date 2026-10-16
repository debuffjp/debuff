---
"@debuff/cli": minor
"create-debuff": minor
---

Tooling plugins (ADR 0004, phase 2a).

- New: `debuff.config.ts` with `defineConfig({ plugins })`, `ToolingPlugin` with function and command (any language, JSON over stdio) asset importers, cached by content hash.
- **Breaking:** source assets move from `public/assets/` to `assets/`. The manifest is generated in memory and is no longer written to disk, and builds ship only files the manifest references.
- `debuff assets --json` and `debuff inspect` report importers and plugin contributions.
