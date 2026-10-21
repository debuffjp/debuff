# ADR 0014: Saves survive game updates, and the build says when they won't

- Status: proposed
- Date: 2026-10-21

## Context

`Storage` (`packages/core/src/storage.ts`) loads a save as `{ ...defaults, ...saved }`, with no check on what was saved. When a game changes the shape of its save, players who already have one load the old shape:

- **Changed type:** `best: 0` becomes `best: { score: 0, time: 0 }`. A returning player loads `best: 412`, and `save.get("best").score` is `undefined`. The game breaks for exactly the players who liked it enough to come back, and no test sees it, because tests start without a save.
- **Changed key:** `new Storage("my-game", …)` becomes `new Storage("my-game-v2", …)`. Every player's progress is gone, silently.
- **Removed or added fields** are harmless today: added fields come from the defaults, and removed ones are kept but unread.

Replays and scenarios are a dev-only artifact, and `debuff scenario` already fails when one stops matching the game, so they need nothing new here. Saves are the part players own.

All four templates use `Storage` with literal defaults (`new Storage("debuff-squish", { best: 0 })`).

## Decision

1. **Runtime: a saved field is used only if its type matches the default's.** On load, `Storage` keeps a saved value when it has the same JSON type as the default (number, string, boolean, null, array, plain object). Otherwise it uses the default for that field, so the game runs, and it keeps the original JSON under `<key>:backup` once, so nothing is destroyed. Nested objects are checked one level deep. This costs a few dozen bytes and changes nothing for saves that already match.
2. **Optional versioned migration.** `new Storage(key, defaults, { version: 2, migrate(old, from) { … } })`. The version is stored with the save; `migrate` runs once when an older one loads. Without `version`, behaviour is (1) alone.
3. **Build: `debuff build` lists every save and compares it with the last accepted one.** The debuff Vite plugin finds `new Storage(<string>, <object literal>)` calls where `Storage` is imported from `@debuffjp/core` (`this.parse`, so no new dependency), and records the key and the type of each default. The result goes in the build report (`saves`) and is compared with `saves.json` in the project, which is committed like a lockfile:
   - key removed or renamed: **error**, "players lose their saves for 'my-game'"
   - field type changed without a `version` bump: **warning**, naming the field and both types, with the line to add `version` and `migrate`
   - field added or removed: noted, not a warning
   - `debuff build --accept-saves` writes the new `saves.json` (like `debuff scenario --update`).
   Calls it can't read statically (a variable key, computed defaults) are listed as "not checked" instead of guessed.
4. **Agents see it too:** `debuff inspect` and the MCP `build` tool include `saves`, and the agent guide in each template says to run the build before changing a save's shape.

## Options considered

| Option | Why not |
| --- | --- |
| Type-guard only (1) | Stops crashes, but players still lose that field's progress without anyone knowing before release |
| Build check only (3) | Catches it before release, but games already shipped keep crashing for returning players |
| Read the types with the TypeScript checker | Precise, but needs the checker API in the CLI. TS 7's JS API is unstable and tsrs has no Windows build. Literal defaults cover every template; the rest are listed as "not checked" |
| Run the game at build time to find saves | Slow, and builds would depend on the game running headless |

## Consequences

- Shipped games stop crashing on old saves as soon as they update debuff (1).
- A save change becomes a deliberate, reviewed step, like a screenshot baseline (3).
- `saves.json` is a new committed file in every project; `create-debuff` templates ship one.
- The build report schema gains `saves` (a minor, additive change under `docs/stability.md`).
- Sizes: (1) and (2) add to `@debuffjp/core`; to be reported in the PR (budget: under 150 bytes brotli).
