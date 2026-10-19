// The same flow with nothing from the hook: keiko reads the screen and the buttons from PixiJS itself.
import { expect, play, test } from "keiko";

test("puzzling potions, no hook: Start Game opens the game screen", async () => {
  const game = await play({ ready: (g) => g.engine?.scene === "HomeScreen" });
  await game.tapWhenReady((g) => g.engine?.targets.find((t) => t.text === "Start Game"));
  await game.eventually(() => game.engine?.scene === "GameScreen", { within: "10s" });
  expect(game.engine.scenes).toContain("GameScreen");
});
