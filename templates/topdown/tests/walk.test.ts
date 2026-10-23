import { describe, expect, play, test } from "keiko";

/** What the play scene's inspect() returns (src/main.ts). */
interface State {
  player: { x: number; y: number; facing: "down" | "up" | "side"; flip: boolean };
  sparks: { collected: number; total: number };
}

describe("walking", () => {
  test("buff starts on the @ tile, facing down", async () => {
    const game = await play<State>();
    expect(game.scene).toBe("play");
    expect(game.state.player).toEqual({ x: 275, y: 166, facing: "down", flip: false });
  });

  test("arrow keys walk and turn buff", async () => {
    const game = await play<State>();
    game.hold("ArrowLeft", "0.5s");
    expect(game.state.player.facing).toBe("side");
    expect(game.state.player.flip).toBe(true);
    expect(game.state.player.x).toBeBelow(275);
    game.hold("ArrowUp", "0.2s");
    expect(game.state.player.facing).toBe("up");
  });

  test("walls stop buff", async () => {
    const game = await play<State>();
    game.command("warp", 1, 1);
    game.press("ArrowLeft").press("ArrowUp");
    game.during("2s", (s) => s.player.x >= 16 && s.player.y >= 16, "buff stays out of the wall");
  });

  test("water is solid too", async () => {
    const game = await play<State>();
    game.command("warp", 12, 1);
    game.hold("ArrowRight", "2s");
    expect(game.state.player.x).toBeBelow(13 * 16);
  });
});

describe("sparks", () => {
  test("walking over a spark collects it once", async () => {
    const game = await play<State>();
    expect(game.state.sparks.total).toBe(7);
    game.command("warp", 1, 2);
    game.press("ArrowRight");
    game.until((s) => s.sparks.collected === 1, { within: "2s" });
    expect(game.emitted("spark")).toBe(1);
    game.hold("ArrowRight", "0.3s");
    expect(game.state.sparks.collected).toBe(1);
  });
});
