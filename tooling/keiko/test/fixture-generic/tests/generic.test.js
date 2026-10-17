import { expect, play, test } from "keiko";

test("walks on DOM key events and frame timestamps", async () => {
  const game = await play();
  expect(game.driver.kind).toBe("keiko");
  expect(game.scene).toBe("level");
  game.hold("ArrowRight", "1s");
  expect(game.state.x).toBe(120);
});

test('Space arrives as the key " "', async () => {
  const game = await play();
  game.tap("Space");
  expect(game.state.jumps).toBe(1);
});

test("pointer taps reach the canvas", async () => {
  const game = await play();
  game.tap(10, 10);
  expect(game.state.clicks).toBe(1);
});

test("params through __KEIKO__", async () => {
  const game = await play({ params: { "player.speed": 60 } });
  game.hold("ArrowRight", "1s");
  expect(game.state.x).toBe(60);
  expect(game.param("player.speed")).toBe(60);
});

test("setTimeout and setInterval run on the virtual clock", async () => {
  const game = await play();
  expect(game.state.wave).toBe(0);
  // play() already ran the first frame, so one second in is 59 steps away.
  const first = game.until((s) => s.wave === 1, { within: "2s" });
  expect(first).toBe(59);
  game.wait("1.5s");
  expect(game.state.wave).toBe(4);
  game.wait("2s");
  expect(game.state.wave).toBe(4);
});

test("Math.random is seeded", async () => {
  const a = (await play({ seed: 5 })).state.sparkle;
  const b = (await play({ seed: 5 })).state.sparkle;
  expect(a).toBe(b);
});

test.deterministic(
  "same seed: deterministic",
  (game) => {
    game.hold("ArrowRight", 30);
  },
  { sameSeed: true },
);

test.deterministic("different seeds expose the unseeded sparkle", (game) => {
  game.hold("ArrowRight", 30);
});

test("hookless games are read through the page, and their crashes are caught", async () => {
  const game = await play({ page: "bare.html" });
  expect(game.driver.kind).toBe("clock");
  expect(game.window.started).toBe(Date.UTC(2026, 0, 1));
  expect(game.tick).toBe(1);
  expect(game.window.frameCount).toBe(1); // play() ran the first frame
  game.wait(1);
  expect(game.window.frameCount).toBe(2);
  game.wait(1);
});

test("commands the game doesn't expose explain how to add them", async () => {
  const game = await play();
  game.command("warp");
});
