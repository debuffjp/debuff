# ADR 0009: keiko, logic tests that run the real game in Node

- Status: accepted
- Date: 2026-10-17

## Context

Scenarios (ADR 0003) drive the game in a real browser and compare screenshots. That's the right tool for "does it look right", but it costs a browser launch and a page load per file, and JSON gets awkward for logic: loops, computed expectations, "how many steps until…", sweeps over params.

Most gameplay questions don't need pixels: does the player reach top speed in a quarter second, does the jump clear the gap, does the enemy turn at the wall, is the run deterministic. They need the simulation, input and state, fast enough to run on every save and by an agent after every change.

Nothing like this exists for web games generally either. Engine-agnostic browser testing (Playwright and friends) runs in real time and can't step a game; engine test helpers are tied to one engine.

## Decision

**keiko** (稽古, "practice"), a standalone package (`keiko` on npm) with its own CLI, usable by any web game, and integrated deeply into debuff (`debuff test`, the MCP server's `run_tests`, templates). It lives in this repo (`tooling/keiko`) but depends on nothing from debuff.

- **Same game, no browser.** `play()` boots the scripts a page (`index.html`) loads, through the project's Vite config and Vite's module runner, in a fresh happy-dom window installed as Node's globals. The game's code is untouched.
- **A virtual clock.** `requestAnimationFrame` queues instead of firing, `setTimeout`/`setInterval`/`requestIdleCallback` wait on virtual time (nested zero-delay timers clamp to 4 ms, as in browsers), `performance.now()` and `Date.now()` return virtual time, and `Math.random()` is seeded. A step advances one frame: due timers fire in order, then the queued frame callbacks run. Timers created by Node's own internals (its `fetch`) stay real.
- **Drivers.** keiko drives a game through a small internal protocol, built from whichever the game offers:
  - **debuff**: its dev hooks (`window.__DEBUFF_DEV__`, opened with `?debuff-scenario`), the same surface scenarios, fuzzing and the MCP server use. Steps are the game's fixed steps; state is the scene's `inspect()`. Detected from the project's dependencies.
  - **keiko hooks**: an optional `window.__KEIKO__` with any of `state()`, `scene()`, `step()`, input, params and commands. Missing pieces fall back to the clock and DOM events.
  - **clock**: no hooks at all. Steps run frames; input is real `keydown`/`keyup` and pointer events (with `key`, `code` and legacy `keyCode`); tests read the page through `game.window`.
- **No rendering, no sound.** Canvas 2D and WebGL 1/2 get inert contexts (shaders compile, framebuffers are complete), so engines boot whichever renderer they prefer. Web Audio is inert. Assets load from the Vite server; images are real `<img>` elements that report their size without decoding; fonts count as loaded. The canvas reports its own size as its box, so pointer mapping works. `play()` waits for the game's first requests to finish, and engines on the virtual clock get their first frame before the test starts, as a browser paints before a player acts.
- **Questions games ask.** Beyond `wait` and input: `until` (how long until a condition holds), `during` (an invariant over a stretch of play), `trace` (a value over time), `test.sweep` (the same test across param values) and `test.deterministic` (play twice, with a different `Math.random` seed and date the second time, and diff every step). Failures report the tick, time, scene and state that broke the expectation.
- **Scenarios are inputs too.** `game.replay(file)` plays the debuff scenario format (minus captures), so overlay replays and fuzz findings become millisecond regression tests.
- **A small runner of its own.** `test`, `describe`, `expect`, `.only`, `.skip`, `.todo`; `--json` for agents; source-mapped stacks; console output shown only for failing tests. It boots Vite once per run and reuses its transform cache across games.

## Consequences

- One game runs at a time per process (DOM globals and the clock are shared). Each `play()` gets a fresh window and freshly evaluated game modules; a boot costs tens of milliseconds after the first.
- `happy-dom` and `vite` are dependencies of keiko (tooling only; nothing ships to players).
- Tests can't await `setTimeout` for real time while a game runs (it's the game's virtual timer); keiko exports `sleep()` for that.
- Verified against debuff, Phaser 4, PixiJS 8, KAPLAY 3001, Excalibur 0.32 and three.js r186 (boot, keyboard, pointer, determinism).
- What's drawn or heard isn't covered: that's what scenarios are for.
- A debuff game exposes what tests assert on through `inspect()`, the same contract as scenarios and agents. Other games expose it through `__KEIKO__.state()`.
- keiko is versioned independently of the `@debuffjp/*` packages.
