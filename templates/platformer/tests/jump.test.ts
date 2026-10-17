import { describe, expect, play, test } from "keiko";

/** What the play scene's inspect() returns (src/main.ts). */
interface State {
  player: { x: number; y: number; onGround: boolean };
  score: number;
  coins: number;
  won: boolean;
  paused: false | "pause" | "settings";
}

describe("jumping", () => {
  test("a held jump rises at least 30 px and lands where it took off", async () => {
    const game = await play<State>();
    game.until((s) => s.player.onGround, { within: "1s" });
    game.press("Space");
    const y = game.trace("player.y", "1.5s");
    // y grows downward, so the apex is the smallest y.
    expect(y.start - y.min()).toBeAbove(30);
    expect(y.last).toBe(y.start);
    expect(game.state.player.onGround).toBe(true);
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

  test.sweep("higher jump speed means a higher apex", { "player.jumpSpeed": [200, 290, 400] }, (game, values) => {
    game.until((s) => s.player.onGround, { within: "1s" });
    game.press("Space");
    const rise = game.trace("player.y", "1s");
    const apex = rise.start - rise.min();
    // v² / 2g, give or take the step size: the jump follows the params, not a hard-coded arc.
    const v = Number(values["player.jumpSpeed"]);
    const g = Number(game.param("player.gravity"));
    expect(apex).toBeCloseTo((v * v) / (2 * g), 6);
  });
});

describe("pause", () => {
  test("Escape pauses, and nothing moves while paused", async () => {
    const game = await play<State>();
    game.wait("0.5s").tap("Escape");
    expect(game.state.paused).toBeTruthy();
    const before = game.state.player;
    game.hold("ArrowRight", "1s");
    expect(game.state.player).toEqual(before);
  });
});

test("the run-and-jump scenario plays the same headless", async () => {
  const game = await play<State>();
  // Scenarios, overlay replays and fuzz findings replay here in milliseconds, captures aside.
  game.replay("scenarios/run-and-jump.json");
  expect(game.state.player.y).toBeBelow(100);
});

test.deterministic("ten seconds of running and jumping are reproducible", (game) => {
  game.hold("ArrowRight", "2s").tap("Space").hold("ArrowRight", "3s").tap("Space").wait("4s");
});
