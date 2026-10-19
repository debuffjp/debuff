import { expect, play, test } from "keiko";

// Real time: while a game runs, the page's virtual clock replaces the global timers.
const realSetTimeout = setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

test(
  "times out, then plays anyway",
  async () => {
    await wait(100);
    await play();
  },
  { timeout: 20 },
);

test("plays on undisturbed", async () => {
  const game = await play<{ x: number }>();
  await wait(300);
  game.hold("ArrowRight", "1s");
  expect(game.state.x).toBe(60);
});
