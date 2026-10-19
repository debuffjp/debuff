// Puzzling Potions (pixijs/open-games): the claim in keiko's "Real games" table.
import { expect, play, test } from "keiko";

const home = { ready: (g) => g.state?.screen === "HomeScreen" && g.state.playButton != null };

async function pressPlay(game) {
  // The home screen reveals its buttons one after another; Play takes input once it has appeared.
  await game.run("2s");
  const { x, y } = game.state.playButton;
  game.tap(x, y);
  await game.eventually((s) => s.screen === "GameScreen" && s.board?.pieces > 0, { within: "10s" });
}

test("puzzling potions: Play opens a full board", async () => {
  const game = await play(home);
  await pressPlay(game);
  const { rows, columns, pieces } = game.state.board;
  expect(pieces).toBe(rows * columns);
  expect(rows * columns).toBeAbove(0);
});

test.deterministic(
  "puzzling potions: two runs match step for step",
  async (game) => {
    await pressPlay(game);
    await game.settle();
    game.wait("2s");
  },
  { sameSeed: true, play: home },
);
