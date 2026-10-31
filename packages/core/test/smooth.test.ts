import { describe, expect, it, vi } from "vitest";
import { Game, smoothMotion } from "../src/index.js";
import { fakeCanvas } from "./helpers.js";

vi.mock("../src/splash.js", () => ({ drawSplash: () => {} }));

const STEP = 1 / 60;

/** A game whose one scene moves `player` 10 units right per step, and each enemy 4 down. */
function setup() {
  const { canvas } = fakeCanvas();
  const game = new Game({ canvas, width: 320, height: 180 });
  const player = { x: 0, y: 0 };
  const enemies = [
    { x: 0, y: 0 },
    { x: 50, y: 50 },
  ];
  game
    .add({
      id: "s",
      update: () => {
        player.x += 10;
        for (const e of enemies) e.y += 4;
      },
    })
    .go("s");
  const smooth = smoothMotion(game, () => [player, enemies]);
  return { game, player, enemies, smooth };
}

describe("smoothMotion", () => {
  it("draws between the previous and the current step by the render alpha", () => {
    const { game, player, smooth } = setup();
    game.step(2);
    // A quarter of a step left over: drawn a quarter of the way from the last step's start.
    game.frame(STEP * 0.25);
    expect(player.x).toBe(20);
    expect(smooth.x(player)).toBeCloseTo(12.5);
    expect(smooth.at(player)).toEqual({ x: smooth.x(player), y: 0 });
    expect(smooth.x(player, 1)).toBe(20);
    expect(smooth.x(player, 0)).toBe(10);
  });

  it("reads arrays one level deep", () => {
    const { game, enemies, smooth } = setup();
    game.step(1);
    game.frame(STEP * 0.5);
    expect(enemies[1]?.y).toBe(54);
    expect(smooth.y(enemies[1] as { x: number; y: number })).toBeCloseTo(52);
  });

  it("blends only the latest step when a frame catches up several", () => {
    const { game, player, smooth } = setup();
    game.frame(STEP * 2.5);
    expect(player.x).toBe(20);
    expect(smooth.x(player)).toBeCloseTo(15);
  });

  it("draws objects it hasn't saved yet where they are", () => {
    const { game, smooth } = setup();
    game.step(1);
    game.frame(STEP * 0.5);
    const newcomer = { x: 7, y: 9 };
    expect(smooth.at(newcomer)).toEqual({ x: 7, y: 9 });
  });

  it("holds still while frozen: the helper, the camera and the alpha scenes get", () => {
    const { game, player, smooth } = setup();
    const alphas: number[] = [];
    game.hooks.beforeRender((_draw, alpha) => alphas.push(alpha));
    game.camera.lerp = 0;
    game.camera.follow(player);
    game.step(3);
    game.freeze(10 * STEP);
    alphas.length = 0;
    const xs: number[] = [];
    const views: number[] = [];
    for (const left of [0.3, 0.5, 0.4, 0.6, 0.3]) {
      game.frame(STEP * left);
      xs.push(smooth.x(player));
      views.push(game.camera.view()[4]);
    }
    expect(new Set(xs)).toEqual(new Set([30]));
    // Before, the view jumped between 142 and 149 on every frame of a freeze, with nothing moving.
    expect(new Set(views).size).toBe(1);
    expect(new Set(alphas)).toEqual(new Set([1]));
    // Unfrozen again, frames blend as before.
    game.frame(9 * STEP);
    game.frame(STEP * 0.5);
    expect(game.frozen).toBe(false);
    expect(smooth.x(player)).not.toBe(player.x);
  });

  it("snap() draws a teleported object where it is until the next step", () => {
    const { game, player, smooth } = setup();
    game.step(1);
    game.frame(STEP * 0.5);
    player.x = 500;
    smooth.snap(player);
    expect(smooth.x(player)).toBe(500);
    // One more step (the half step left over stays), saved from 500: blending resumes.
    game.frame(STEP);
    expect(player.x).toBe(510);
    expect(smooth.x(player)).toBeCloseTo(505);
  });

  it("stops saving after dispose()", () => {
    const { game, player, smooth } = setup();
    game.step(1);
    smooth.dispose();
    game.step(1);
    game.frame(STEP * 0.5);
    expect(smooth.x(player)).toBe(player.x);
  });
});
