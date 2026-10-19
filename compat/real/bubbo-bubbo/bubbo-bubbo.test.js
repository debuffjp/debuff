// Bubbo Bubbo (pixijs/open-games): the claim in keiko's "Real games" table. It isn't frame-for-frame
// deterministic (it switches screens when its assets arrive; see keiko's known limits), so only the outcome is checked.
import { play, test } from "keiko";

test("bubbo bubbo: Play reaches the game", async () => {
  const game = await play();
  // The title fades in, then slides its buttons into place: tap Play once the engine shows it settled on screen.
  await game.tapWhenReady((g) => g.engine?.targets.some((t) => t.text === "SHOOT BUBBLES!") && g.state?.playButton, { within: "20s" });
  await game.eventually((s) => s?.screen === "GameScreen", { within: "10s" });
});
