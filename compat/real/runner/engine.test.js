// With nothing from the hook: keiko reads the active scene from Phaser itself.
import { play, test } from "keiko";

test("runner, no hook: the game scene starts and standing still ends in game over", async () => {
  const game = await play({ ready: (g) => g.engine?.scene === "game" });
  await game.eventually(() => game.engine?.scene === "gameover", { within: "30s" });
});
