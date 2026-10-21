---
"@debuffjp/core": minor
"@debuffjp/cli": minor
"@debuffjp/mcp": minor
"create-debuff": minor
---

Saves survive game updates (ADR 0014). `Storage` uses a saved field only if its JSON type matches the default's, so a save from an older version of the game can't break it (the original is kept once under `<key>:backup`). `new Storage(key, defaults, { version, migrate })` upgrades older saves once. `debuff build` finds every save, compares it with `saves.json` (committed, like a lockfile), fails if a save key disappears and warns when a field's type changes without a version bump; `--accept-saves` records intended changes. `debuff inspect` and the MCP `build` tool include saves, and the templates ship a `saves.json`.
