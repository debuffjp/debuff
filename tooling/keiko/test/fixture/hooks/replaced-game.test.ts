import { expect, play, test } from "keiko";

// A second play() replaces the first game's page and clock: using the old game must say so.
test("uses a game after play() replaced it", async () => {
  const first = await play<{ x: number }>();
  await play<{ x: number }>();
  expect(() => first.hold("ArrowRight", "0.1s")).toThrow(/replaced by a later play\(\)/);
});
