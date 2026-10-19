import { describe, expect, mulberry32, play, test } from "keiko";
import { collapse, fill, findMatches, findMove, fromRows, toRows } from "../src/board";

/** What the play scene's inspect() returns (src/main.ts). */
interface State {
  phase: "idle" | "swap" | "unswap" | "pop" | "fall" | "over";
  score: number;
  moves: number;
  combo: number;
  selected: number;
  cursor: number;
  board: string[];
  adrift: number;
}

// No matches yet; swapping the first two pieces of the top row lines up three "a"s.
const READY = ["abaacdef", "cdefabcd", "efabcdef", "abcdefab", "cdefabcd", "efabcdef", "abcdefab", "cdefabcd"];
/** Centre of a board cell, in game pixels (the board starts at 12, 150 with 42px cells). */
const cell = (i: number) => [12 + (i % 8) * 42 + 21, 150 + Math.floor(i / 8) * 42 + 21] as const;

describe("board rules", () => {
  test("finds lines of three or more across and down, nothing else", async () => {
    // aaa across the top, bbb down the right, ccc down the second column; the lone d's and pairs don't count.
    const b = fromRows(["aaab", "bcdb", "acdb", "dcad"]);
    expect([...findMatches(b)].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 5, 7, 9, 11, 13]);
  });

  test("a fresh board has no matches and at least one move", async () => {
    const random = mulberry32(1);
    for (let i = 0; i < 20; i++) {
      const b = fill(8, 8, 6, random);
      expect(findMatches(b).size).toBe(0);
      expect(findMove(b)).toBeDefined();
    }
  });

  test("pieces fall into gaps and new ones fill from the top", async () => {
    const b = fromRows(["ab", ".c", "d."]);
    const falls = collapse(b, () => 4);
    expect(toRows(b)).toEqual(["ee", "ab", "dc"]);
    expect(falls.filter((f) => f.colour !== undefined)).toHaveLength(2);
  });
});

describe("playing", () => {
  test("a round starts idle with 25 moves on a full board", async () => {
    const game = await play<State>();
    expect(game.scene).toBe("play");
    game.wait("1s");
    expect(game.state.phase).toBe("idle");
    expect(game.state.moves).toBe(25);
    expect(game.state.board.join("")).not.toContain(".");
  });

  test("a matching swap pops, scores and spends a move", async () => {
    const game = await play<State>();
    game.command("board", READY);
    game
      .tap(...cell(0))
      .tap(...cell(1))
      .wait("2s");
    expect(game.state.score).toBeAtLeast(30);
    expect(game.state.moves).toBe(24);
    expect(game.state.phase).toBe("idle");
    expect(game.state.board.join("")).not.toContain(".");
  });

  test("a swap that matches nothing swaps back and costs nothing", async () => {
    const game = await play<State>();
    game.command("board", READY);
    const before = game.state.board;
    game
      .tap(...cell(6))
      .tap(...cell(7))
      .wait("1s");
    expect(game.state.board).toEqual(before);
    expect(game.state.moves).toBe(25);
  });

  test("swiping a piece swaps it", async () => {
    const game = await play<State>();
    game.command("board", READY);
    const [cx, cy] = cell(0);
    game
      .pointerDown(cx, cy)
      .wait(1)
      .pointerMove(cx + 30, cy)
      .wait(1)
      .pointerUp()
      .wait("2s");
    expect(game.state.moves).toBe(24);
  });

  test("the round ends when moves run out, and a tap starts a new one", async () => {
    const game = await play<State>();
    game.command("board", READY);
    game.command("moves", 1);
    game
      .tap(...cell(0))
      .tap(...cell(1))
      .wait("3s");
    expect(game.state.phase).toBe("over");
    game.tap("Space").wait("1s");
    expect(game.state.phase).toBe("idle");
    expect(game.state.moves).toBe(25);
    expect(game.state.score).toBe(0);
  });
});

describe("drawing matches the rules", () => {
  test("after swaps, failed swaps and cascades, every piece is drawn in its own cell", async () => {
    const game = await play<State>();
    game.command("board", READY);
    game
      .tap(...cell(6))
      .tap(...cell(7))
      .wait("1s"); // no match: swaps back
    expect(game.state.adrift).toBe(0);
    game
      .tap(...cell(0))
      .tap(...cell(1))
      .wait("3s"); // match, then refill
    expect(game.state.phase).toBe("idle");
    expect(game.state.adrift).toBe(0);
    // A busy minute of random swipes.
    for (let i = 0; i < 60; i++) {
      const [x, y] = cell((i * 37) % 64);
      game
        .pointerDown(x, y)
        .wait(1)
        .pointerMove(x + (i % 2 ? 30 : 0), y + (i % 2 ? 0 : 30))
        .wait(1)
        .pointerUp()
        .wait("0.8s");
      if (game.state.phase === "idle") expect(game.state.adrift).toBe(0);
    }
  });
});

test.deterministic("thirty seconds of random swaps are reproducible", (game) => {
  const keys = ["ArrowRight", "ArrowDown", "Space", "ArrowLeft", "Space", "ArrowUp"];
  for (let i = 0; i < 60; i++) game.tap(keys[i % keys.length]!).wait("0.5s");
});
