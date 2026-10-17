import { describe, expect, play, test } from "keiko";

describe("dot", () => {
  test("walks right at its speed", async () => {
    const game = await play<{ x: number }>();
    game.hold("ArrowRight", "1s");
    expect(game.state.x).toBe(60);
  });

  test("sweeps speed", async () => {
    const game = await play<{ x: number }>({ params: { "dot.speed": 120 } });
    game.hold("ArrowRight", "0.5s");
    expect(game.state.x).toBe(60);
  });

  test("a failing expectation reports the game state", async () => {
    const game = await play<{ x: number }>();
    game.command("teleport", 5);
    console.log("about to fail");
    expect(game.state.x).toBe(6);
  });

  test("a crash in the game fails with where it happened", async () => {
    const game = await play();
    game.wait(2).tap("KeyC");
  });

  test("slow tests time out", () => new Promise(() => {}), { timeout: 50 });

  test("stray promise rejections fail the test that caused them", async () => {
    await play();
    void Promise.reject(new Error("stray"));
  });

  test("a ready check that never passes", async () => {
    await play({ ready: () => false, timeout: 30 });
  });

  test("a page without the game", async () => {
    await play({ page: "missing.html" });
  });

  test.skip("skipped", () => {});
  test.todo("todo");
});
