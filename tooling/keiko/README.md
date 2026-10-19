# keiko

**稽古 (keiko): practice.** Fast, deterministic tests for web games.

keiko runs your real game in Node, with no browser and nothing drawn. Time, input and randomness only move when the test says so, so every run plays out the same way. A typical test takes tens of milliseconds.

```ts
// tests/movement.test.ts
import { expect, play, test } from "keiko";

test("the player reaches top speed within a quarter second", async () => {
  const game = await play();
  game.press("ArrowRight");
  expect(game.until((s) => s.player.vx >= 140)).toBeAtMost(15);
});
```

```bash
npx keiko
```

It works with any game that runs in a browser and loads through an `index.html`, whatever the engine: it drives games through the web platform (frames, timers, the clock, DOM events) rather than an engine API. [debuff](https://debuff.jp) games get the deepest integration: `npx debuff test`, the debuff MCP server's `run_tests` tool, and their dev tools as the driver.

### Engines it's tested with

Each has a small game in [`compat/`](https://github.com/debuffjp/debuff/tree/main/compat) that checks boot, holding a key to move, a click at an exact position, seeded randomness and a determinism check. Maintainers run it with `npm run compat`.

| Engine | Version | Keyboard | Pointer | Deterministic | Notes |
| --- | --- | --- | --- | --- | --- |
| debuff | 0.3 | ✔ | ✔ | ✔ | Driven through its dev hooks |
| Phaser | 4.2, 3.90 | ✔ | ✔ | ✔ | |
| PixiJS | 8.22 | ✔ | ✔ | ✔ | |
| KAPLAY | 3001.0 | ✔ | ✔ | ✔ | Needs keiko 0.4.2+ for click positions |
| Excalibur | 0.32 | ✔ | ✔ | ✔ | |
| three.js | r186 | ✔ | ✔ | ✔ | |
| Hand-written canvas loop | | ✔ | ✔ | ✔ | |

### Real games

keiko was also run by hand against open-source games it had never seen. Each needed only a `window.__KEIKO__` hook added. These runs aren't in `compat/` yet.

| Game | Engine | Tests | Deterministic |
| --- | --- | --- | --- |
| [Runner](https://github.com/phaserjs/phaser-by-example) | Phaser 3 | score, jump, game over | ✔ |
| [Starshake](https://github.com/phaserjs/phaser-by-example) | Phaser 3 | start, move, shoot | ✔ |
| [Puzzling Potions](https://github.com/pixijs/open-games) | PixiJS 8 | Play opens a full board | ✔ |
| [Bubbo Bubbo](https://github.com/pixijs/open-games) | PixiJS 8 | Play reaches the game | ✘ (see [limits](#known-limits)) |

If your engine trips over the headless page, please [open an issue](https://github.com/debuffjp/debuff/issues) with a minimal game.

This README is the complete reference. Using debuff? Its guide, [debuff.jp/docs/testing](https://debuff.jp/docs/testing), walks through keiko with debuff projects.

## What makes it different

- **It plays your actual game.** `play()` boots the scripts your `index.html` loads, through your Vite config, in a fresh headless page. No mocks of your game and no special build.
- **Time is the test's.** `requestAnimationFrame`, `setTimeout`, `setInterval`, `requestIdleCallback`, `performance.now()` and `Date` (`Date.now()`, `new Date()`) run on a virtual clock that only moves when the test steps it, so engines with their own loop, and gameplay built on timers, play frame by frame the same way every run. `Math.random()` is seeded.
- **It asks game questions.** How long until the player reaches top speed (`until`)? Does the player ever leave the screen (`during`)? How high is the jump (`trace`)? Does it still work at every gravity you might ship (`test.sweep`)? Is the game deterministic (`test.deterministic`)?
- **Failures show the game.** Every failure reports the frame, time, scene and state when it broke, the line in your test, and the console output.
- **Bugs become tests.** `game.replay(file)` plays a recorded scenario, so a bug found by hand or by a fuzzer becomes a millisecond regression test.

## Setup

```bash
npm install -D keiko
```

Put tests in `tests/**/*.test.ts` (or `.js`; `src/**/*.test.ts` works too) and run `npx keiko`. If you use TypeScript, add `"tests"` to `include` in `tsconfig.json`.

### Let tests see your game

Without anything else, keiko can play your game: it steps the virtual clock and sends real keyboard and pointer events. To **read** the game's state, expose a snapshot as `window.__KEIKO__` in development builds:

```ts
if (import.meta.env.DEV) {
  window.__KEIKO__ = {
    state: () => ({ player: { x: player.x, y: player.y, vx: player.body.velocity.x }, score }),
    scene: () => currentScene.key,
  };
}
```

With Phaser, for example:

```ts
const game = new Phaser.Game(config);
if (import.meta.env.DEV) {
  window.__KEIKO__ = {
    state: () => {
      const level = game.scene.getScene("level") as Level;
      return level.player ? { player: { x: level.player.x, y: level.player.y } } : undefined;
    },
    scene: () => game.scene.getScenes(true)[0]?.scene.key,
  };
}
```

```ts
const game = await play({ ready: (g) => g.scene === "level" && g.state !== undefined });
```

Adding keiko to a game you didn't write, where the scenes and buttons already exist? The [hooking-up guide](https://debuff.jp/keiko/engines#hooking-up-an-existing-game) has copy-paste hooks for Phaser scenes and PixiJS screen managers, including how to expose button positions for `tap()`.

Every hook is optional:

| Hook | Used by | |
| --- | --- | --- |
| `state()` | `game.state`, `until`, `during`, `trace` | A JSON-friendly snapshot of what tests assert on |
| `scene()` | `game.scene` | The active scene or screen's name |
| `step(n)` + `stepSeconds` | every step | For engines with their own fixed step. Default: one virtual frame per step |
| `press(code)`, `release(code)` | key input | Default: DOM `keydown`/`keyup` on the focused element, bubbling to `window` |
| `pointerDown(x, y)`, `pointerMove`, `pointerUp` | pointer input | Default: DOM pointer and mouse events on the first `<canvas>` |
| `params()`, `setParam(group, key, value)` | `game.param`, `game.set`, `params` option, `test.sweep` | Tunable values: `{ player: { speed: 140 } }` |
| `command(name, ...args)` | `game.command` | Shortcuts for tests, like warping to a level |

For types, add `import type {} from "keiko";` to the file that sets `window.__KEIKO__` (it's erased from the build).

### debuff games

Nothing to add. keiko detects debuff projects from their dependencies and drives them through `devTools({ input })`, which every debuff template installs. `game.state` is the active scene's `inspect()`, params and commands are debuff's, and steps are the game's own fixed steps. Run tests with `npx debuff test` or `npx keiko` (keiko loads debuff's Vite plugin from the project's `@debuffjp/cli`), or let an agent run them with the MCP server's `run_tests` tool.

## API

### `play(options?)`

Boots a fresh game and returns a [`Playtest`](#playtest). Calling it again replaces the previous game.

| Option | Default | |
| --- | --- | --- |
| `page` | `"index.html"` | Page to boot, relative to the project root |
| `params` | | Params to set before the first step: `{ "player.speed": 200 }` |
| `ready` | once the scripts and their first loads finish (debuff: once a scene is active) | When the game counts as ready, e.g. `(g) => g.scene === "level-1"`. keiko plays frames while it waits |
| `timeout` | `10000` | Milliseconds of real time to wait for `ready` |
| `seed` | `1` | Seed for `Math.random()` |
| `fps` | `60` | Frames per second of the virtual clock |
| `webgl` | `true` (debuff: `false`) | Offer WebGL. `false` makes engines fall back to Canvas 2D |
| `viewport` | `{ width: 960, height: 540 }` | The window's size, e.g. `{ width: 390, height: 844 }` for a portrait game |

`play()` resolves once the game's scripts have run, its first requests (assets, data) have finished, and `ready` passes. For games on the virtual clock it then plays one frame, as a browser paints before a player can act, so `game.tick` starts at 1. debuff games start at tick 0.

Type the state for autocompletion: `play<{ player: { x: number } }>()`.

### `Playtest`

Reading:

| | |
| --- | --- |
| `game.state` | The game's state snapshot |
| `game.scene`, `game.tick`, `game.time` | Scene name, steps played, simulated seconds |
| `game.get("state.player.x")` | Any path of everything the driver reports |
| `game.param("player.speed")`, `game.params()` | Param values |
| `game.window` | The game's page, for globals and the DOM |
| `game.stepSeconds` | Seconds per step |
| `game.driver` | How keiko drives this game (`kind`: `"debuff"`, `"keiko"` or `"clock"`) |

Playing (each returns the playtest, so calls chain):

| | |
| --- | --- |
| `wait(duration = 1)` | Play with the current input |
| `press(code)` / `release(code)` | Hold or let go of a key (`KeyboardEvent.code`: `"ArrowLeft"`, `"KeyZ"`, `"Space"`) |
| `hold(code, duration)` | Press, wait, release |
| `tap(code)` / `tap(x, y)` | A key or pointer press for one step |
| `pointerDown(x, y)`, `pointerMove(x, y)`, `pointerUp()` | The pointer |
| `set("group.key", value)` / `set({ … })` | Set params |
| `command(name, ...args)` | Run a game command |
| `replay(fileOrScenario)` | Play a scenario's steps (see below) |
| `await settle()` | Wait, in real time, for requests the game started (lazy-loaded assets) to finish. Game time doesn't move |

A **duration** is a number of steps (`30`) or time (`"0.5s"`, `"250ms"`), rounded to whole steps.

Asking:

| | Returns | |
| --- | --- | --- |
| `await run(duration)` | the playtest | Like `wait`, but lets the game's async code (promise chains, tweens awaited in UI flows, loads) continue between frames, like a browser does |
| `await eventually(condition, { within })` | steps taken | Like `until`, letting async code and loads finish between frames. Use it after an action that loads a screen |
| `until(condition, { within })` | steps taken | Plays until `condition(state)` holds. Fails with the last state if it doesn't within `within` (default `"10s"`) |
| `emitted(name)` | number | How many times the game emitted `name` (debuff: `game.emit("coin")`), 0 until the first time. `game.until(() => game.emitted("coin") > 0)` |
| `during(duration, check, message?)` | the playtest | Plays and checks an invariant after every step; fails at the step where it broke. `check` can return `false` or throw |
| `trace(pathOrFn, duration)` | a `Trace` | Plays and records a value every step |

A `Trace` has `start` (the value before the first step), `first`, `last`, `at(i)`, `min()`, `max()`, `range()`, `stepOf(valueOrPredicate)`, `every()`, `some()`, `changes()` and `timeAt(step)`, and is iterable:

```ts
game.press("Space");
const y = game.trace("player.y", "1s");
expect(y.start - y.min()).toBeAbove(40); // jumps at least 40 px (y grows downward)
expect(y.last).toBe(y.start);           // and lands where it took off
```

### `test`, `describe`

```ts
test(name, fn, { timeout? });   // fn is usually async; default timeout 30 s of real time
test.only(name, fn);            // run only focused tests
test.skip(name, fn?);           // registered, not run
test.todo(name);                // a reminder in the report
describe(name, () => { … });    // groups nest; describe.only / describe.skip apply inside
beforeEach(fn);                 // before each test in this file or describe (outer hooks first)
afterEach(fn);                  // after each test, even failing ones (inner hooks first)
```

Shared setup:

```ts
describe("the hollow", () => {
  let game: Playtest<State>;
  beforeEach(async () => {
    game = await play<State>();
    game.command("warp", "hollow");
  });

  test("the door starts shut", () => {
    expect(game.state.doorOpen).toBe(false);
  });
});
```

**Sweeps** run the same test across params, one test per combination:

```ts
test.sweep("clears the first gap", { "player.jumpSpeed": [260, 290, 320], "player.gravity": [800, 900] }, (game) => {
  game.hold("ArrowRight", "0.4s").tap("Space");
  game.until((s) => s.player.x > 120, { within: "2s" });
});
```

**Determinism checks** play a script twice and compare the state after every step. The second run gets a different `Math.random()` seed and a different date, so logic that depends on unseeded randomness or the wall clock is caught:

```ts
test.deterministic("ten seconds of play are reproducible", (game) => {
  game.hold("ArrowRight", "2s").tap("Space").wait("8s");
});
// ✖ the two runs diverged at tick 37: state.enemies.0.x was 112 in the first run and 118 in the second.
```

Pass `{ sameSeed: true }` if your engine seeds its own generator from `Math.random()` on purpose.

### `expect(value)`

`toBe`, `toEqual`, `toBeAbove`, `toBeBelow`, `toBeAtLeast`, `toBeAtMost`, `toBeBetween`, `toBeCloseTo(target, tolerance = 0.001)`, `toBeTruthy`, `toBeFalsy`, `toBeDefined`, `toBeUndefined`, `toContain`, `toHaveLength`, `toMatch`, `toThrow`, and `.not` for each.

### Errors

| Error | When |
| --- | --- |
| `ExpectationError` | An `expect` failed |
| `GameError` | The game threw while being played. Has `tick`, `scene` and the original error as `cause` |
| `TimeoutError` | `until` ran out of time |
| `InvariantError` | `during` caught a broken invariant |
| `MissingHookError` | A test used a hook the game doesn't expose |

Errors a game raises outside any test (say, an asset that fails to load after its test ended) are listed at the end of the run and fail it.

### Replaying scenarios

`game.replay()` takes a JSON file (or object) of steps: `wait`, `press`, `release`, `tap`, `pointerDown`, `pointerMove`, `pointerUp`, `set`, `command`, `expect` and `until` (`within` in steps, default 600). It's the [debuff scenario format](https://debuff.jp/docs/scenarios), so debuff's overlay replays and fuzz findings play directly; any tool can write it. `capture` and `contrast` steps are skipped, and `flashes` only plays its frames, since nothing is drawn: those are checked by `debuff scenario`. Plugin steps (names with a `:`) are refused.

## The CLI

```bash
npx keiko                     # every test
npx keiko tests/jump.test.ts  # some files
npx keiko tests/levels        # every test in a folder
npx keiko -t "pause"          # tests whose name contains "pause"
npx keiko --json              # a report for tools and agents
npx keiko --root games/demo   # a project in another folder
npx keiko --no-debuff         # drive a debuff game through __KEIKO__ instead (--debuff forces the opposite)
```

Exits with 1 when a test fails. For tools, the same runner is `runTests()` from `keiko/runner`.

## What runs, and what doesn't

The game runs in a [happy-dom](https://github.com/capricorn86/happy-dom) page with your project's Vite config.

- **Rendering:** Canvas 2D and WebGL 1/2 contexts accept every call and draw nothing. Shaders compile, framebuffers are complete and pixel reads return zeros, so engines boot whichever renderer they prefer.
- **Sound:** Web Audio plays nothing; decoding succeeds instantly.
- **Assets:** images and other files load from the Vite server. Images are real `<img>` elements that report their size (PNG, GIF, JPEG) without decoding pixels. Fonts count as loaded.
- **Layout:** the canvas's box is its CSS size (`style.width`/`height`, else its pixel size) at the page's origin, so engines that map pointer positions through it get the coordinates you passed.
- **Workers:** Web Workers run inline on the page's thread, including from `blob:` URLs, with `fetch` and `createImageBitmap`.
- **Shaders:** programs report the attributes and uniforms their GLSL declares, so engines that enumerate them bind without warnings.
- **Time:** everything above runs on the virtual clock. Node's own timers (inside `fetch`, for example) keep real time. To wait in real time inside a test, use `await sleep(ms)` from keiko, not `setTimeout`, which is the game's virtual one while a game runs.

So keiko covers simulation, input, timing, params, scenes and anything your state snapshot exposes. It doesn't cover what's drawn or heard: for that, use screenshot tests in a real browser (debuff's [scenarios](https://debuff.jp/docs/scenarios)). One game runs at a time.

### Known limits

keiko assumes the common case and stays fast rather than modelling every browser timing. Some things it doesn't do:

- **Timing races between real loads and frames.** keiko waits for loads between frames when you use `run()` or `eventually()`, but work that finishes on its own schedule (a worker reply, a chain of loads that starts more loads) can land on a different frame from one run to the next. A game whose logic depends on that ordering, like Bubbo Bubbo switching screens when its assets arrive, won't be frame-for-frame deterministic. Assert on outcomes (`eventually(s => s.screen === "game")`) rather than exact ticks for those flows.
- **Pixels and sound.** Nothing is drawn or heard; use a real browser for that.
- **Native layout.** There's no CSS layout engine, so DOM-based UI positions are only what the game sets explicitly.
- **WebGPU, WebAssembly threads, SharedArrayBuffer workers** aren't provided.

The design is recorded in [ADR 0009](https://github.com/debuffjp/debuff/blob/main/docs/adr/0009-logic-tests.md).

## License

MIT
