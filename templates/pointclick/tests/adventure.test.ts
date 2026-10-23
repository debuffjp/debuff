import { describe, expect, play, test } from "keiko";

/** What the play scene's inspect() returns (src/main.ts). */
interface State {
  room: string;
  player: { x: number; y: number; walking: boolean };
  inventory: string[];
  hotspots: { name: string; x: number; y: number; kind: "exit" | "item" | "use" }[];
  saying: string;
  won: boolean;
}

describe("walking", () => {
  test("a click on the floor walks buff there", async () => {
    const game = await play<State>();
    expect(game.state.room).toBe("yard");
    game.tap(200, 150);
    expect(game.state.player.walking).toBe(true);
    game.until((s) => !s.player.walking, { within: "4s" });
    expect(game.state.player).toEqual({ x: 200, y: 150, walking: false });
  });

  test("a click above the floor keeps buff on the floor", async () => {
    const game = await play<State>();
    game.tap(100, 20);
    game.until((s) => !s.player.walking, { within: "4s" });
    expect(game.state.player.y).toBe(118);
  });
});

describe("hotspots", () => {
  test("looking at the sign makes buff say something", async () => {
    const game = await play<State>();
    const sign = game.state.hotspots.find((h) => h.name === "sign");
    if (!sign) throw new Error("no sign");
    game.tap(sign.x, sign.y);
    game.until((s) => s.saying !== "", { within: "4s" });
    expect(game.state.saying).toContain("hall");
  });

  test("clicking the key walks over and picks it up", async () => {
    const game = await play<State>();
    const key = game.state.hotspots.find((h) => h.name === "key");
    if (!key) throw new Error("no key");
    game.tap(key.x, key.y);
    game.until((s) => s.inventory.includes("key"), { within: "4s" });
    expect(game.emitted("pickup")).toBe(1);
    expect(game.state.hotspots.some((h) => h.name === "key")).toBe(false);
  });

  test("the exit fades into the hall", async () => {
    const game = await play<State>();
    game.tap(308, 140);
    game.until((s) => s.room === "hall", { within: "6s" });
    expect(game.emitted("room")).toBe(1);
    expect(game.state.hotspots.map((h) => h.name)).toContain("door");
  });
});

describe("the door", () => {
  test("is locked without the key", async () => {
    const game = await play<State>();
    game.tap(308, 140);
    game.until((s) => s.room === "hall", { within: "6s" });
    game.tap(160, 60);
    game.until((s) => s.saying !== "", { within: "4s" });
    expect(game.state.saying).toContain("locked");
    expect(game.state.won).toBe(false);
  });

  test("opens with the key", async () => {
    const game = await play<State>();
    game.command("give", "key");
    game.tap(308, 140);
    game.until((s) => s.room === "hall", { within: "6s" });
    game.tap(160, 60);
    game.until((s) => s.won, { within: "4s" });
    expect(game.emitted("win")).toBe(1);
  });
});
