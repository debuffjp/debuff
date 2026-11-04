# Decisions

Small choices that the code and the [ADRs](adr/) don't settle, with the options considered. Add an entry when you make one. A decision that changes the architecture gets an ADR instead.

## The spryte mirror gets a copy on each release, not a subtree split

`debuffjp/spryte` stopped at 0.7.3 while npm reached 0.12.1, because the `git subtree split` from ADR 0013 was a manual step. The mirror also has its own files (issue templates, dependabot, its standalone CI, brand images, charts and a lockfile) that a split doesn't contain. `scripts/sync-spryte-mirror.mjs` runs from the Release workflow and commits a copy of the package on top of the mirror's history when the versions differ, leaving those files alone and regenerating the lockfile. Considered: force-pushing the split (deletes the mirror's files and rewrites public history) and merging the split (keeps per-commit history on the mirror but conflicts wherever the mirror diverged). The cost is one mirror commit per release: per-commit history stays in this repo, and each sync message names the debuff commit. Outside contributors' commits are replayed ahead of that commit, because GitHub's contributor list goes by commit author.

## Build reports spend maximum Brotli effort on code and HTML

Papercut #21 reproduced with 40 binary files of 8 MiB each: `debuff build --json` took 234.48 s on macOS arm64 with Node 26.7.0. `buildReport` compressed every file at Node's default Brotli quality 11. From 0.29.1 it uses quality 4 for assets, source maps and other files, keeping quality 11 for code and HTML so existing code budgets stay comparable. Raw bytes, gzip settings and shipped files stay the same. Considered: lowering quality for every file (changes code budgets), skipping compressed asset sizes (changes the report's contract) and caching reports (adds cache invalidation and still leaves the first build slow).

## mossfell's long flash checks get a local 120 s step budget

The accessibility scenario captures 300 frames in one flash check. Two fresh Linux CI runs hit the default 60 s step limit (papercut #42), so this scenario sets `stepTimeout: 120`. The frame counts and flash assertions stay the same. Considered: splitting each check (could miss flashes across the boundary), raising the default for every project (delays real hang detection elsewhere) and setting a budget on this one scenario.

## agent-cli is a repo script, not npm scripts or an MCP tool

`bin/agent-cli` (logic in `scripts/agent-cli.mjs`) gathers the lookups and commands that 98 past agent sessions in this repo repeated: status, check with only the failures, one-file tests, exports, docs search, versions, release, site, papercuts and ports. Options considered: more `npm run` scripts (no `--json`, no arguments without `--`, and npm's banner on every call), tools on the debuff MCP server (that server is for people making games, not for working on debuff) and a script with no dependencies. The script won: one entry point with `--help` and `--json`, nothing to install, and it runs where the agent already has a shell.

## smoothMotion reads a function of objects, and frozen frames render at alpha 1

`smoothMotion(game, () => [player, enemies, shots])` saves positions in a `WeakMap` on every `beforeUpdate`, for whatever the function returns then. overbuffed, the evidence for roadmap item 2, kept `prevX`/`prevY` (or `px`/`py`) on every object and copied them at the top of each step. Considered: `track(o)` / `untrack(o)` per object (games spawn and drop shots every step and would forget to untrack, so it leaks), and fields written onto the objects (changes their shape and their `inspect()` output). A saved position is only used if it came from the step that just ran, so new objects, frozen steps and `snap()` all draw where the object is.

While writing it, a probe showed the camera's view jumping by up to 7 px on every frame of `game.freeze()`: no steps run, but `renderAlpha` kept changing. `Game.render` now passes alpha 1 while frozen, to the camera, the scene and the render hooks. Considered: holding only the camera (`camera.hold()` on frozen steps; it still blended until the first frozen step ran, and games' own lerps kept wobbling). Scenario captures render at alpha 0 between whole steps, so one taken during a freeze now shows the camera one step further on.

## Dev clips save through the dev server, and sharing stays out of games

The dev panel's **clip** button and the `saveClip` hook post the video to `/__debuff/capture`, which writes `.debuff/captures/`. Returning it through the agent link instead would push several MB through one SSE message and a 10 s RPC timeout, and the human's button would have nowhere to save but Downloads. `.debuff/` is already in new projects' `.gitignore`, so clips don't land in git; `debuff ship press` copies them into the kit. Clips prefer MP4 because X and most stores don't take WebM.

`@debuffjp/dev` now depends on `@debuffjp/share` for `ClipRecorder` rather than keeping a second copy of the staggered-recorder logic.

Templates don't get share buttons, hashtags or "made with" tags. What a game shows is the creator's call; the tooling helps on the developer side (captures, press kits, drafting posts) and `postIntent` is there for anyone who wants it. Considered: a share button on template game-over screens (rejected by the maintainer as too much control over what people make).

## keiko touch pointerIds start at 2

A finger's DOM `pointerId` in keiko is its touch id + 2 (`TOUCH_POINTER_OFFSET` in `tooling/keiko/src/driver.ts`). `Touch.identifier` keeps the id the scenario gave. Before this, finger 1 and the mouse both had `pointerId` 1, so a game that tracked pointers by id mixed them up. Considered: a separate id range per kind (larger change to scenario files), and rejecting touch id 1 (breaks existing scenarios).

## Commit messages and docs omit the serial comma

The repo writes "a, b and c". When `scripts/lint-prose.mjs` was added, 22 lists used a serial comma and about 340 didn't, so the lint doesn't require one.

## Papercut reporting stays out of the browser packages and keiko

myaku and spryte don't report papercuts themselves, though the board has a section for each. They run inside players' browsers, and a game must never send anything to us on its own. Their friction reaches the board through the debuff CLI and MCP server, which already run when a developer works on them, and through agents calling `report_papercut`. Considered: a dev-only reporter in `@debuffjp/dev` (still runs in the developer's browser, and would need its own disclosure) and doing nothing (the sections stay empty). keiko stays out too (maintainer's call, 2026-10-30): it is a standalone tool that Phaser and Pixi users run without debuff, and they never agreed to report to the debuff board.

From 0.24.2 `debuff dev` reports bugs the dev tools catch inside debuff, and this still holds: `@debuffjp/dev` only fires a `debuff:bug` event in the page, the dev server (the CLI, in Node) checks the signature and sends it, and nothing in the page talks to the board. A built game has no `@debuffjp/dev` and sends nothing. The papercuts notice was versioned so the new reports were disclosed before any went out (maintainer's call to make it opt-out for everyone, 2026-10-31).

## Biome's Markdown formatter stays off

Biome 2.6 formats Markdown by default, which would reformat every README, ADR and changeset in one commit. The bump to 2.6.3 turns it off in `biome.json`, so the upgrade changes no files. The new lint rules it brings (`useMathMinMax`, `useDateNow`) stay warnings: rewriting core's `clamp` as `Math.min(Math.max(...))` changes what it returns for NaN. Considered: accepting the reformat (a large diff nobody reviewed for meaning), and staying on 2.5 (dependabot keeps reopening the bump).
