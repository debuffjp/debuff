# Decisions

Small choices that the code and the [ADRs](adr/) don't settle, with the options considered. Add an entry when you make one. A decision that changes the architecture gets an ADR instead.

## scale: "pixel" scales by a fraction below one device pixel per unit

Papercut #25: with `scale: "pixel"`, `pixelSize: 1` and a 1280 by 720 minimum, a 1024 wide window showed a 1280 wide canvas, because `Game.resize` never went below one device pixel per unit. The JSDoc already said a container too small for the minimum scales down. From 0.29.3, when even one device pixel per unit doesn't fit, it keeps the fractional `fit` scale, still grows the logical size along the spare axis and keeps the minimum. Pixels aren't crisp in that case, which is the same trade `fit` makes. Considered: letterboxing at one device pixel with a CSS downscale (the same blur, plus bars and a logical size that no longer follows the container), keeping the overflow with a dev warning (leaves games cut off for players, against what the docs said) and lowering the logical minimum (changes the game's layout, which is the creator's call). Containers that fit at one device pixel or more scale by whole device pixels as before.

## The spryte mirror gets a copy on each release, not a subtree split

`debuffjp/spryte` stopped at 0.7.3 while npm reached 0.12.1, because the `git subtree split` from ADR 0013 was a manual step. The mirror also has its own files (issue templates, dependabot, its standalone CI, brand images, charts and a lockfile) that a split doesn't contain. `scripts/sync-spryte-mirror.mjs` runs from the Release workflow and commits a copy of the package on top of the mirror's history when the versions differ, leaving those files alone and regenerating the lockfile. Considered: force-pushing the split (deletes the mirror's files and rewrites public history) and merging the split (keeps per-commit history on the mirror but conflicts wherever the mirror diverged). The cost is one mirror commit per release: per-commit history stays in this repo, and each sync message names the debuff commit. Outside contributors' commits are replayed ahead of that commit, because GitHub's contributor list goes by commit author.

## spryte warns about sprites across images only in development

Papercut #37: `draw.sprites` with `each.frame` frames on more than one image drew one quad per copy, and only the JSDoc said so. From 0.12.3 spryte warns once per renderer when `import.meta.env.DEV` is true, using the guard `@debuffjp/core` uses, so production builds drop the check. Considered: an unconditional warning like the detached-array one (that one means nothing drew, but mixing images is a legitimate choice a shipped game would then log for every player) and throwing (breaks games that accept the cost). The cost: spryte used outside a bundler that sets `import.meta.env` never warns.

## The asset build warns about images over 4096 pixels on a side

Papercut #30: a 19800×80 grid sheet drew every frame as a black rectangle, and neither the build nor the console said why. From 0.29.3 `compileAssets` reads each PNG's header and warns when either side is over 4096 pixels. Considered: 2048 (the only size WebGL2 promises, and the atlas default, but it would warn about 4096 backgrounds that work on every WebGL2 device in practice), 8192 and 16384 (common on desktop GPUs but missing on some phones, so a game could pass the build and draw black there) and a config option for the limit (more surface than a warning needs; nothing reads it yet). 4096 is the largest size that works everywhere in practice, so a warning means a real risk. The check covers PNGs only, since that header gives the size without decoding; JPEG and WebP would need a parser each. spryte doesn't check `MAX_TEXTURE_SIZE` when it uploads an image yet: that would add bytes to every game and is a separate change.

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

## keiko mutate: what a param mutant tries, and where results go

A number param goes to each end of its declared range, or to 0 and double its value when it has none; a boolean flips. debuff rejects values outside a param's range (`ParamGroup.set` throws), so the out-of-range values first planned (x0, x2, a flipped sign) would have been unviable for every debuff game. The range ends are values a designer could ship, so a missed one means no test depends on the param anywhere in its range. Considered: halving and doubling clamped to the range (more mutants, and the halves mostly duplicate what the ends show).

Seed and frame-rate mutants are reported as unviable for debuff games rather than left out, so nothing is skipped without a line saying why. The seed offset is 7919, the same one `test.deterministic` uses for its second run.

Results go to `mutants.out/`, the folder cargo-mutants and mutant.cafe use, so agents that know either tool know where to look. Considered: `.debuff/mutants` (keiko runs outside debuff projects too) and `.keiko/` (a new hidden folder for one command). The command is `keiko mutate`, a subcommand like `keiko init`, rather than a `henka` binary: henka has no runner of its own.

Changed in henka 0.1.0 (before its first release): henka gained its own `henka` command for Vitest projects, since source mutants need a runner and Vitest is the one Vite projects already have. `keiko mutate` stays a keiko subcommand.

## Replay checkpoints hash each part of the state and only warn

From 0.31 a recording keeps a checkpoint every 60 ticks, so a replay can say where it stopped matching (the idea comes from rollback engines such as bones, which compare state checksums to find desyncs). Each checkpoint is an 8-digit FNV-1a hash per part: `scene`, `events`, each top-level key of `inspect()` and each plugin snapshot. Considered: one hash per checkpoint (25 bytes, but a drift only names the tick) and the full state per checkpoint (names the exact path, but a few minutes of play could make a replay megabytes). Per-part hashes cost a few hundred bytes a second and name the area, such as `state.enemies`.

A drift is a warning, not a failure. Replays get saved as regression scenarios, and every later change to the game would fail them on checkpoints even when the captures and `expect` steps still pass. Considered: failing (brittle in exactly that way) and rewriting checkpoints with `--update` (edits the user's scenario file, where `--update` only ever writes baselines). The camera is left out of the hash because its size follows the window, which differs between the human's tab and a scenario's viewport.

## henka source mutants: a warm Vitest per job, a Vite plugin, test files from the baseline

Each job keeps a Vitest process open whose only change is a Vite plugin that returns the mutated text for one file; between mutants it invalidates that file in every project's module graph and in the workers. The baseline turns on Vitest 5's `experimental.importDurations` with no limit, which lists every module each test file ran, so a mutant run goes straight to the test files that loaded its file instead of working out Vitest's `related` graph again. Considered:

- Stryker's schemata, every mutant compiled into the code at once behind a switch. No re-transform per mutant, but the instrumented code has to type-check and survive every other plugin's transform, and a mutant in code that runs at import needs a full reload (Stryker's "static" mutants).
- cargo-mutants' way, patching a copy of the project on disk. Needs a copy per job (the debuff repo is gigabytes with `node_modules`) and a watcher could pick up a half-written file.
- A fresh Vitest process per mutant, the first version. Simplest, but starting Vitest was most of each run.

A run past the timeout has its process tree killed (taskkill on Windows, a process group elsewhere), counts as caught, and the job starts a new process. `fsModuleCache` is off in mutant runs so a mutated transform never lands in Vitest 5's disk cache. A file that another `enforce: "pre"` plugin changed before henka's plugin runs is reported as unviable rather than mutated blind.

The operators are the smallest set that finds the gaps a game's tests leave: arithmetic, comparison boundaries, logic, sign, number literals and function bodies. Left out for now: string literals (mostly log and error text), array and object literals, optional chaining and regular expressions, which Stryker has.
