// Starshake (phaser-by-example): the claims in keiko's "Real games" table.
import { expect, play, test } from "keiko";

async function start() {
  const game = await play({ ready: (g) => g.scene === "splash" });
  game.tap("Space");
  await game.eventually((s) => s.player !== undefined, { within: "10s" });
  return game;
}

test("starshake: Space on the splash starts stage 1", async () => {
  const game = await start();
  expect(game.scene).toBe("game");
});

test("starshake: the arrow keys move the ship", async () => {
  const game = await start();
  const { x, y } = game.state.player;
  game.hold("ArrowLeft", "0.5s").hold("ArrowUp", "0.5s");
  expect(game.state.player.x).toBeBelow(x - 50);
  expect(game.state.player.y).toBeBelow(y - 50);
});

test("starshake: Space shoots", async () => {
  const game = await start();
  const before = game.state.shots;
  game.tap("Space");
  expect(game.state.shots).toBeAbove(before);
});

test.deterministic(
  "starshake: two runs match step for step",
  async (game) => {
    game.tap("Space");
    await game.eventually((s) => s.player !== undefined, { within: "10s" });
    game.hold("ArrowLeft", "0.5s").tap("Space").wait("1s");
  },
  { sameSeed: true, play: { ready: (g) => g.scene === "splash" } },
);
