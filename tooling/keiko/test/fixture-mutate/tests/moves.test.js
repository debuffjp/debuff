import { expect, play, test } from "keiko";

test("walks right", async () => {
  const game = await play();
  game.hold("ArrowRight", "1s");
  expect(game.state.x).toBeAbove(60);
});

// Counts frames, so it breaks at another frame rate: what `keiko mutate` calls brittle.
test("reaches x 60 in exactly 31 frames", async () => {
  const game = await play();
  game.press("ArrowRight");
  expect(game.until((s) => s.x >= 60)).toBe(31);
});

test("the coin is somewhere", async () => {
  const game = await play();
  expect(game.state.coin).toBeAbove(0);
});
