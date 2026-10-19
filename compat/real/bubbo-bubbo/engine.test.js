// The same flow with nothing from the hook: keiko reads the screen and the buttons from PixiJS itself.
import { play, test } from "keiko";

test("bubbo bubbo, no hook: Shoot Bubbles! reaches the game", async () => {
  const game = await play({ ready: (g) => g.engine !== undefined });
  await game.tapWhenReady((g) => g.engine?.targets.find((t) => t.text === "SHOOT BUBBLES!"), { within: "20s" });
  await game.eventually(() => game.engine?.scene === "GameScreen", { within: "10s" });
});
