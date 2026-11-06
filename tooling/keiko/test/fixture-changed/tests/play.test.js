import { expect, play, test } from "keiko";

const ready = (g) => g.state !== undefined;

test("walks", async () => {
  const game = await play({ ready });
  game.hold("ArrowRight", 10);
  expect(game.state.x).toBeAbove(0);
});

test("shoots", async () => {
  const game = await play({ ready });
  game.hold("KeyZ", 10);
  expect(game.state.shots).toBeAbove(0);
});
