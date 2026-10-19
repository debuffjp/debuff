// Runner (phaser-by-example): the claims in keiko's "Real games" table.
import { expect, play, test } from "keiko";

const ready = (g) => g.scene === "game" && g.state?.onGround === true;

test("runner: the score climbs while you survive", async () => {
  const game = await play({ ready });
  const start = game.state.score;
  game.wait("1s");
  expect(game.state.score).toBeAbove(start);
});

test("runner: Space jumps and the runner lands again", async () => {
  const game = await play({ ready });
  game.tap("Space");
  const y = game.trace("y", "0.5s");
  expect(y.start - y.min()).toBeAbove(40);
  game.until((s) => s.onGround, { within: "3s" });
});

test("runner: standing still ends in game over", async () => {
  const game = await play({ ready });
  await game.eventually(() => game.scene === "gameover", { within: "30s" });
});

test.deterministic(
  "runner: two runs match step for step",
  (game) => {
    game.wait("1s").tap("Space").wait("2s");
  },
  { sameSeed: true, play: { ready } },
);
