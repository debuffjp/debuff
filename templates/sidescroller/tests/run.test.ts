import { describe, expect, play, test } from "keiko";

/** What the play scene's inspect() returns (src/main.ts). */
interface State {
  player: { x: number; y: number; vx: number; vy: number; onGround: boolean; facing: number };
  collected: number;
  sparks: { x: number; y: number }[];
}

describe("running", () => {
  test("buff lands on the ground under the @ tile", async () => {
    const game = await play<State>();
    expect(game.scene).toBe("play");
    game.until((s) => s.player.onGround, { within: "1s" });
    expect(game.state.player.y).toBe(115);
  });

  test("reaches run speed and stops after letting go", async () => {
    const game = await play<State>();
    game.until((s) => s.player.onGround, { within: "1s" });
    game.press("ArrowRight");
    game.until((s) => s.player.vx >= 110, { within: "1s" });
    game.release("ArrowRight");
    game.until((s) => s.player.vx === 0, { within: "1s" });
    expect(game.state.player.facing).toBe(1);
  });

  test("the left wall stops buff", async () => {
    const game = await play<State>();
    game.press("ArrowLeft");
    game.during("2s", (s) => s.player.x >= 0, "buff stays inside the level");
  });
});

describe("jumping", () => {
  test("a held jump rises at least 30 px and lands where it took off", async () => {
    const game = await play<State>();
    game.until((s) => s.player.onGround, { within: "1s" });
    game.press("Space");
    const y = game.trace("player.y", "1.5s");
    // y grows downward, so the apex is the smallest y.
    expect(y.start - y.min()).toBeAbove(30);
    expect(y.last).toBe(y.start);
  });

  test("holding jump goes higher than tapping it", async () => {
    const tapped = await play<State>();
    tapped.until((s) => s.player.onGround, { within: "1s" });
    tapped.tap("Space");
    const low = tapped.trace("player.y", "1s").min();

    const held = await play<State>();
    held.until((s) => s.player.onGround, { within: "1s" });
    held.press("Space");
    const high = held.trace("player.y", "1s").min();
    expect(high).toBeBelow(low);
  });

  test("planks hold buff from above and let it drop through", async () => {
    const game = await play<State>();
    game.command("warp", 14, 4);
    game.until((s) => s.player.onGround, { within: "1s" });
    expect(game.state.player.y).toBe(83);
    game.press("ArrowDown");
    game.until((s) => s.player.y > 90, { within: "1s" });
  });
});

describe("sparks", () => {
  test("running through a spark collects it once", async () => {
    const game = await play<State>();
    expect(game.state.sparks.length).toBe(7);
    game.command("warp", 50, 7);
    game.press("ArrowRight");
    game.until((s) => s.collected === 1, { within: "2s" });
    expect(game.emitted("spark")).toBe(1);
  });

  test("falling into a pit restarts the level", async () => {
    const game = await play<State>();
    game.command("warp", 50, 7);
    game.press("ArrowRight");
    game.until((s) => s.collected === 1, { within: "2s" });
    game.command("warp", 12, 6);
    game.until((s) => s.collected === 0, { within: "3s" });
    expect(game.state.player.x).toBe(66);
  });
});
