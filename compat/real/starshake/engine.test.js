// With nothing from the hook: keiko reads the active scene from Phaser itself.
import { play, test } from "keiko";

test("starshake, no hook: Space on the splash starts the game", async () => {
  const game = await play({ ready: (g) => g.engine?.scene === "splash" });
  game.tap("Space");
  await game.eventually(() => game.engine?.scene === "game", { within: "10s" });
});
