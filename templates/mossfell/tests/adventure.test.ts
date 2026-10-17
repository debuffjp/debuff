import { expect, play, test } from "keiko";

/** Part of what the play scene's inspect() returns (src/main.ts). */
interface State {
  state: "play" | "won" | "lost";
  screen: { col: number; row: number };
  player: { x: number; y: number; hp: number; keys: number; facing: string; swinging: boolean };
  enemies: { kind: string; hp: number; x: number; y: number }[];
  doorOpen: boolean;
}

test("the warp command puts buff in the hollow", async () => {
  const game = await play<State>();
  // Commands registered with devTools({ commands }) are shortcuts for tests, scenarios and agents.
  game.command("warp", "hollow");
  game.wait(10);
  expect(game.state.screen).toEqual({ col: 3, row: 1 });
});

test("a sword swing lasts less than half a second", async () => {
  const game = await play<State>();
  game.tap("KeyZ");
  expect(game.state.player.swinging).toBe(true);
  const steps = game.until((s) => !s.player.swinging, { within: "1s" });
  expect(steps * game.stepSeconds).toBeBelow(0.5);
});

test("buff never walks off the map", async () => {
  const game = await play<State>();
  game.press("ArrowLeft").press("ArrowUp");
  game.during("4s", (s) => s.player.x >= 0 && s.player.y >= 0, "buff stays inside the map");
});

test("the key-and-door scenario plays the same headless", async () => {
  const game = await play<State>();
  game.replay("scenarios/key-and-door.json");
  expect(game.state.state).toBe("won");
});
