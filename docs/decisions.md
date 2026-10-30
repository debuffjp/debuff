# Decisions

Small choices that the code and the [ADRs](adr/) don't settle, with the options considered. Add an entry when you make one. A decision that changes the architecture gets an ADR instead.

## Dev clips save through the dev server, and sharing stays out of games

The dev panel's **clip** button and the `saveClip` hook post the video to `/__debuff/capture`, which writes `.debuff/captures/`. Returning it through the agent link instead would push several MB through one SSE message and a 10 s RPC timeout, and the human's button would have nowhere to save but Downloads. `.debuff/` is already in new projects' `.gitignore`, so clips don't land in git; `debuff ship press` copies them into the kit. Clips prefer MP4 because X and most stores don't take WebM.

`@debuffjp/dev` now depends on `@debuffjp/share` for `ClipRecorder` rather than keeping a second copy of the staggered-recorder logic.

Templates don't get share buttons, hashtags or "made with" tags. What a game shows is the creator's call; the tooling helps on the developer side (captures, press kits, drafting posts) and `postIntent` is there for anyone who wants it. Considered: a share button on template game-over screens (rejected by the maintainer as too much control over what people make).

## keiko touch pointerIds start at 2

A finger's DOM `pointerId` in keiko is its touch id + 2 (`TOUCH_POINTER_OFFSET` in `tooling/keiko/src/driver.ts`). `Touch.identifier` keeps the id the scenario gave. Before this, finger 1 and the mouse both had `pointerId` 1, so a game that tracked pointers by id mixed them up. Considered: a separate id range per kind (larger change to scenario files), and rejecting touch id 1 (breaks existing scenarios).

## Commit messages and docs omit the serial comma

The repo writes "a, b and c". When `scripts/lint-prose.mjs` was added, 22 lists used a serial comma and about 340 didn't, so the lint doesn't require one.
