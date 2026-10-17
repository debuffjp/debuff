import { describe, expect, play, test } from "keiko";

/** What the play scene's inspect() returns (src/main.ts). */
interface State {
  player: { x: number; vx: number };
  pops: number;
  particles: number;
}

describe("movement", () => {
  test("buff starts in the middle, standing still", async () => {
    const game = await play<State>();
    expect(game.scene).toBe("play");
    expect(game.state.player).toEqual({ x: 160, vx: 0 });
  });

  test("reaches top speed within a quarter second", async () => {
    const game = await play<State>();
    game.press("ArrowRight");
    const steps = game.until((s) => s.player.vx >= 140, { within: "1s" });
    expect(steps).toBeAtMost(15);
  });

  test("never leaves the screen", async () => {
    const game = await play<State>();
    game.press("ArrowLeft");
    game.during("3s", (s) => s.player.x >= 8, "buff stays on screen");
  });

  test.sweep("stops in speed ÷ acceleration after letting go", { "player.speed": [80, 140, 300] }, (game) => {
    game.hold("ArrowRight", "0.5s");
    const steps = game.until((s) => s.player.vx === 0, { within: "1s" });
    const expected = Number(game.param("player.speed")) / Number(game.param("player.accel"));
    expect(steps * game.stepSeconds).toBeCloseTo(expected, game.stepSeconds);
  });
});

describe("popping", () => {
  test("Space pops once per press and makes particles", async () => {
    const game = await play<State>();
    game.tap("Space").wait(4);
    expect(game.state.pops).toBe(1);
    expect(game.state.particles).toBeAbove(0);
  });
});

test.deterministic("five seconds of play are reproducible", (game) => {
  game.hold("ArrowRight", "1s").tap("Space").hold("ArrowLeft", "2s").wait("2s");
});
