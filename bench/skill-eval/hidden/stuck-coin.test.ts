// Hidden check for the stuck-coin task: all 12 coins are still in the level, none sits inside a solid tile, and the
// raised block the coin was buried in is still solid (the fix moved the coin, not the ground).
import { readFileSync } from "node:fs";
import { expect, play, test } from "keiko";

interface State {
  coins: number;
  pickups: { x: number; y: number }[];
}

const map = JSON.parse(readFileSync("assets/level1.tmj", "utf8"));
const ground = map.layers.find((l: { name: string }) => l.name === "ground").data as number[];
// Tile gids 1, 2 and 4 are solid; 3 is the one-way plank.
const solid = (c: number, r: number) => [1, 2, 4].includes(ground[r * map.width + c]);

test("eval: every coin can be reached", async () => {
  const game = await play<State>();
  expect(game.state.coins).toBe(12);
  for (const { x, y } of game.state.pickups) {
    const inside = [x + 1, x + 10].some((px) => [y + 1, y + 10].some((py) => solid(Math.floor(px / 16), Math.floor(py / 16))));
    expect(inside).toBe(false);
  }
  for (let c = 44; c <= 51; c++) expect(solid(c, 9) && solid(c, 10)).toBe(true);
});
