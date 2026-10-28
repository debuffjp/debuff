// Hidden check for the tune-jump task: with the game's own defaults (no params set here), a held jump rises
// clearly higher than the template's ~47 px, and still lands where it took off.
import { expect, play, test } from "keiko";

interface State {
  player: { y: number; onGround: boolean };
}

test("eval: a held jump rises higher than before", async () => {
  const game = await play<State>();
  game.until((s) => s.player.onGround, { within: "1s" });
  game.press("Space");
  const y = game.trace("player.y", "2s");
  expect(y.start - y.min()).toBeAbove(52);
  expect(y.last).toBe(y.start);
});
