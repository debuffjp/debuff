# Decisions

Small choices that the code and the [ADRs](adr/) don't settle, with the options considered. Add an entry when you make one. A decision that changes the architecture gets an ADR instead.

## smoothMotion reads a function of objects, and frozen frames render at alpha 1

`smoothMotion(game, () => [player, enemies, shots])` saves positions in a `WeakMap` on every `beforeUpdate`, for whatever the function returns then. overbuffed, the evidence for roadmap item 2, kept `prevX`/`prevY` (or `px`/`py`) on every object and copied them at the top of each step. Considered: `track(o)` / `untrack(o)` per object (games spawn and drop shots every step and would forget to untrack, so it leaks), and fields written onto the objects (changes their shape and their `inspect()` output). A saved position is only used if it came from the step that just ran, so new objects, frozen steps and `snap()` all draw where the object is.

While writing it, a probe showed the camera's view jumping by up to 7 px on every frame of `game.freeze()`: no steps run, but `renderAlpha` kept changing. `Game.render` now passes alpha 1 while frozen, to the camera, the scene and the render hooks. Considered: holding only the camera (`camera.hold()` on frozen steps; it still blended until the first frozen step ran, and games' own lerps kept wobbling). Scenario captures render at alpha 0 between whole steps, so one taken during a freeze now shows the camera one step further on.

## keiko touch pointerIds start at 2

A finger's DOM `pointerId` in keiko is its touch id + 2 (`TOUCH_POINTER_OFFSET` in `tooling/keiko/src/driver.ts`). `Touch.identifier` keeps the id the scenario gave. Before this, finger 1 and the mouse both had `pointerId` 1, so a game that tracked pointers by id mixed them up. Considered: a separate id range per kind (larger change to scenario files), and rejecting touch id 1 (breaks existing scenarios).

## Commit messages and docs omit the serial comma

The repo writes "a, b and c". When `scripts/lint-prose.mjs` was added, 22 lists used a serial comma and about 340 didn't, so the lint doesn't require one.

## Papercut reporting stays out of the browser packages and keiko

myaku and spryte don't report papercuts themselves, though the board has a section for each. They run inside players' browsers, and a game must never send anything to us on its own. Their friction reaches the board through the debuff CLI and MCP server, which already run when a developer works on them, and through agents calling `report_papercut`. Considered: a dev-only reporter in `@debuffjp/dev` (still runs in the developer's browser, and would need its own disclosure) and doing nothing (the sections stay empty). keiko stays out too (maintainer's call, 2026-10-30): it is a standalone tool that Phaser and Pixi users run without debuff, and they never agreed to report to the debuff board.

From 0.24.2 `debuff dev` reports bugs the dev tools catch inside debuff, and this still holds: `@debuffjp/dev` only fires a `debuff:bug` event in the page, the dev server (the CLI, in Node) checks the signature and sends it, and nothing in the page talks to the board. A built game has no `@debuffjp/dev` and sends nothing. The papercuts notice was versioned so the new reports were disclosed before any went out (maintainer's call to make it opt-out for everyone, 2026-10-31).

## Biome's Markdown formatter stays off

Biome 2.6 formats Markdown by default, which would reformat every README, ADR and changeset in one commit. The bump to 2.6.3 turns it off in `biome.json`, so the upgrade changes no files. The new lint rules it brings (`useMathMinMax`, `useDateNow`) stay warnings: rewriting core's `clamp` as `Math.min(Math.max(...))` changes what it returns for NaN. Considered: accepting the reformat (a large diff nobody reviewed for meaning), and staying on 2.5 (dependabot keeps reopening the bump).
