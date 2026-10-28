// Hidden check for the double-jump task: a second jump press in mid-air goes higher than the same jump without
// it, and a third press doesn't add another jump.
import { expect, play, test } from "keiko";

interface State {
  player: { y: number; onGround: boolean };
}

async function apex(presses: number): Promise<number> {
  const game = await play<State>();
  game.until((s) => s.player.onGround, { within: "1s" });
  const start = game.state.player.y;
  let top = start;
  for (let i = 0; i < 3; i++) {
    if (i < presses) game.press("Space");
    for (let f = 0; f < 15; f++) {
      game.wait(1);
      top = Math.min(top, game.state.player.y);
    }
    game.release("Space");
    for (let f = 0; f < 3; f++) {
      game.wait(1);
      top = Math.min(top, game.state.player.y);
    }
  }
  for (let f = 0; f < 60; f++) {
    game.wait(1);
    top = Math.min(top, game.state.player.y);
  }
  return start - top;
}

test("eval: a second press in mid-air jumps again, a third doesn't", async () => {
  const single = await apex(1);
  const double = await apex(2);
  const triple = await apex(3);
  expect(double).toBeAbove(single + 10);
  expect(triple).toBeBelow(double + 5);
});
