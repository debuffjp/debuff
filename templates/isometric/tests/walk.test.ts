import { describe, expect, play, test } from "keiko";

/** What the play scene's inspect() returns (src/main.ts). */
interface State {
  player: { gx: number; gy: number; x: number; y: number; facing: "down" | "up" | "side"; flip: boolean };
  sparks: { collected: number; total: number };
}

describe("walking", () => {
  test("buff starts in the middle of the @ cell", async () => {
    const game = await play<State>();
    expect(game.scene).toBe("play");
    expect(game.state.player.gx).toBe(7.5);
    expect(game.state.player.gy).toBe(6.5);
    expect(game.state.player.facing).toBe("down");
  });

  test("right on the keyboard is right on screen, which is diagonal on the grid", async () => {
    const game = await play<State>();
    const before = game.state.player;
    game.hold("ArrowRight", "0.5s");
    const after = game.state.player;
    expect(after.x).toBeAbove(before.x);
    expect(after.y).toBe(before.y);
    expect(after.gx).toBeAbove(before.gx);
    expect(after.gy).toBeBelow(before.gy);
    expect(after.facing).toBe("side");
    expect(after.flip).toBe(false);
  });

  test("blocks stop buff", async () => {
    const game = await play<State>();
    game.command("warp", 1, 1);
    game.press("ArrowLeft").press("ArrowUp");
    game.during("2s", (s) => s.player.gx >= 1 && s.player.gy >= 1, "buff stays out of the wall");
  });
});

describe("sparks", () => {
  test("walking over a spark collects it once", async () => {
    const game = await play<State>();
    expect(game.state.sparks.total).toBe(4);
    game.command("warp", 2, 1);
    // Down on screen is the grid diagonal (+gx, +gy): from cell (2, 1) it runs through the spark in (3, 2).
    game.press("ArrowDown");
    game.until((s) => s.sparks.collected === 1, { within: "2s" });
    expect(game.emitted("spark")).toBe(1);
    game.hold("ArrowDown", "0.3s");
    expect(game.state.sparks.collected).toBe(1);
  });
});
