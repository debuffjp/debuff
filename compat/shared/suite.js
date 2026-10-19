// The same checks for every engine, matching the columns of keiko's "Engines it's tested with" table.
import { expect, play, test } from "keiko";

const ready = (g) => g.state?.ready === true;

export function suite(engine) {
  test(`${engine}: boots into the level`, async () => {
    const game = await play({ ready });
    expect(game.scene).toBe("level");
  });

  test(`${engine}: holding a key walks about 120 px per second, and letting go stops`, async () => {
    const game = await play({ ready });
    const start = game.state.x;
    game.hold("ArrowRight", "1s");
    expect(game.state.x - start).toBeBetween(110, 130);
    const stopped = game.state.x;
    game.wait("0.5s");
    expect(game.state.x).toBe(stopped);
  });

  test(`${engine}: a click lands at the exact position`, async () => {
    const game = await play({ ready });
    game.tap(200, 100);
    game.wait(2);
    expect(game.state.clicks).toBe(1);
    expect(game.state.px).toBe(200);
    expect(game.state.py).toBe(100);
  });

  test(`${engine}: Math.random is seeded`, async () => {
    const a = (await play({ ready, seed: 7 })).state.roll;
    const b = (await play({ ready, seed: 7 })).state.roll;
    const c = (await play({ ready, seed: 8 })).state.roll;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test.deterministic(
    `${engine}: two runs match step for step`,
    (game) => {
      game.hold("ArrowRight", "0.5s").tap(50, 60).wait("0.5s").hold("ArrowRight", "0.25s");
    },
    { sameSeed: true, play: { ready } },
  );
}
