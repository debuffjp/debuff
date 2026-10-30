# Decisions

Small choices that the code and the [ADRs](adr/) don't settle, with the options considered. Add an entry when you make one. A decision that changes the architecture gets an ADR instead.

## keiko touch pointerIds start at 2

A finger's DOM `pointerId` in keiko is its touch id + 2 (`TOUCH_POINTER_OFFSET` in `tooling/keiko/src/driver.ts`). `Touch.identifier` keeps the id the scenario gave. Before this, finger 1 and the mouse both had `pointerId` 1, so a game that tracked pointers by id mixed them up. Considered: a separate id range per kind (larger change to scenario files), and rejecting touch id 1 (breaks existing scenarios).

## Commit messages and docs omit the serial comma

The repo writes "a, b and c". When `scripts/lint-prose.mjs` was added, 22 lists used a serial comma and about 340 didn't, so the lint doesn't require one.

## Papercut reporting stays out of the browser packages

myaku and spryte don't report papercuts themselves, though the board has a section for each. They run inside players' browsers, and a game must never send anything to us on its own. Their friction reaches the board through the debuff CLI and MCP server, which already run when a developer works on them, and through agents calling `report_papercut`. Considered: a dev-only reporter in `@debuffjp/dev` (still runs in the developer's browser, and would need its own disclosure) and doing nothing (the sections stay empty). keiko, a Node CLI that people use without debuff, is waiting on the maintainer's call.
