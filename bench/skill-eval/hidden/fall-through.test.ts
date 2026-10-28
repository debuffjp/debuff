// Hidden check for the fall-through task: a jump onto the first floating one-way plank (x 128..192, top y 128)
// lands on it. With the bug, the player drops through and lands on the ground (y 163).
import { expect, play, test } from "keiko";

interface State {
  player: { x: number; y: number; h: number; onGround: boolean };
}

test("eval: the player lands on a one-way plank", async () => {
  const game = await play<State>();
  game.set("player.jumpSpeed", 400);
  game.until((s) => s.player.onGround, { within: "1s" });
  game.press("ArrowRight");
  game.until((s) => s.player.x >= 100, { within: "3s" });
  game.press("Space");
  game.wait("0.3s");
  game.release("ArrowRight");
  game.wait("1.5s");
  expect(game.state.player.y + game.state.player.h).toBe(128);
  expect(game.state.player.onGround).toBe(true);
});
