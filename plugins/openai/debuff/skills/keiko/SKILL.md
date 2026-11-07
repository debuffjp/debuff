---
name: keiko
description: Use when the user wants tests for a browser game, or to check that a mechanic, a fix or a tuning change works without playing it by hand. Works with any web game (Phaser, PixiJS, KAPLAY, Excalibur, three.js, a hand-written loop, debuff). keiko plays the real game in Node with no browser, on a virtual clock, so tests take milliseconds and every run plays the same.
---

# Testing a web game with keiko

keiko (稽古, "practice") runs the game's real code in Node: no browser, nothing drawn. Time only moves when the test steps it, `Math.random` is seeded, and input is real keyboard and pointer events. Assert on the game's state.

Docs: https://debuff.jp/keiko/ · Engine recipes: https://debuff.jp/keiko/engines

## Set up (once)

```bash
npm install -D keiko
```

1. **Let tests read the game.** In a debuff project, nothing to do: state comes from the scene's `inspect()`. Otherwise add a hook in development builds, exposing only what tests will assert on, and return `undefined` until the game is ready:

   ```ts
   if (import.meta.env.DEV) {
     window.__KEIKO__ = {
       scene: () => game.scene.getScenes(true)[0]?.scene.key, // Phaser example
       state: () => (player ? { x: Math.round(player.x), y: Math.round(player.y), score } : undefined),
     };
   }
   ```

   For an existing Phaser or PixiJS game, follow https://debuff.jp/keiko/engines#hooking-up-an-existing-game. Expose button positions in page pixels if tests need to click them.
2. **Put tests in `tests/*.test.ts`** and run `npx keiko` (`npx debuff test` in debuff projects). Add `"tests"` to `tsconfig.json`'s `include`.

## Writing tests

```ts
import { expect, play, test } from "keiko";

const ready = (g) => g.state !== undefined;

test("holding right moves the player", async () => {
  const game = await play({ ready });
  const start = game.state.x;
  game.hold("ArrowRight", "1s");
  expect(game.state.x - start).toBeBetween(100, 130);
});

test.deterministic("a run plays the same twice", (game) => game.hold("ArrowRight", 30).wait(60), { play: { ready } });
```

- **Time:** `wait(steps | "0.5s")`, `until(condition, { within })`, `during(duration, check)`, `trace("player.y", "1s")`.
- **Input:** `press`/`release`/`hold`/`tap(code)` (`"PointerRight"` / `"PointerMiddle"` for mouse buttons), `tap(x, y)`, `pointerDown/Move/Up`, `wheel(dy)`, `touchDown/Move(id, x, y)`, `touchUp(id)`.
- **Async flows** (press Play, a screen loads its assets): `await game.eventually((s) => s.screen === "game", { within: "5s" })` and `await game.run("2s")`, not `until`/`wait`.
- **Tuning:** `test.sweep("jump clears the gap", { "player.jump": [300, 350, 400] }, …)` runs the test for each value.

## Working rules

- One test per mechanic: search `tests/` first. A fix, tweak or variant goes into that mechanic's existing test (another assertion, a `test.sweep` value); a new mechanic gets one new test. Watch it fail before the fix when you can.
- Don't test param defaults, constants or helpers on their own: a test that only fails when someone retunes a number slows every run and catches nothing. When one test covers another, ask the human before deleting either.
- Assert on outcomes (position, score, scene), not exact tick counts, for flows that load or animate.
- If `test.deterministic` fails, read its message: it says whether loads were in flight (assert on the outcome) or points at `Math.random`, `Date.now` or real-time timers in game logic.
- To check the tests themselves, run `npx keiko mutate --json` (keiko 0.8+). A `missed` param means no test notices it at either end of its range: assert on the behaviour it controls, not its exact value, in the test of that mechanic (a new test only if none plays it). A `brittle` mutant means a test depends on exact random draws or frame counts.
- keiko can't see pixels or sound. For what's drawn, use screenshots in a real browser.
