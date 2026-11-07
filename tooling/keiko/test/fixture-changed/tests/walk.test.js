import { expect, play, test } from "keiko";

const ready = (g) => g.state !== undefined;

test("walks", async () => {
  const game = await play({ ready });
  game.hold("ArrowRight", 10);
  expect(game.state.x).toBeAbove(0);
});
