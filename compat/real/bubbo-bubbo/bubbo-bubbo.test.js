// Bubbo Bubbo (pixijs/open-games): the claim in keiko's "Real games" table. It isn't frame-for-frame
// deterministic (it switches screens when its assets arrive; see keiko's known limits), so only the outcome is checked.
import { play, test } from "keiko";

test("bubbo bubbo: Play reaches the game", async () => {
  const game = await play();
  await game.eventually((s) => s?.screen === "TitleScreen" && s.playButton != null, { within: "20s" });
  const { x, y } = game.state.playButton;
  game.tap(x, y);
  await game.eventually((s) => s?.screen === "GameScreen", { within: "10s" });
});
