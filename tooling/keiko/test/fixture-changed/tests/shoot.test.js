import { expect, play, test } from "keiko";

const ready = (g) => g.state !== undefined;

test("shoots", async () => {
  const game = await play({ ready });
  game.hold("KeyZ", 10);
  expect(game.state.shots).toBeAbove(0);
});
