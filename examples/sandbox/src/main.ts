import { Game, type Scene } from "@debuff/core";
import { Keyboard, axis } from "@debuff/input";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Missing #game canvas");

const game = new Game({ canvas, width: 320, height: 180, background: "#1b1b2a", seed: 1 });
const keys = new Keyboard();

const tuning = game.params.define("player", {
  speed: { type: "number", default: 120, min: 0, max: 600, units: "px/s", description: "Horizontal move speed" },
  size: { type: "number", default: 12, min: 4, max: 48, units: "px" },
});

const play: Scene = (() => {
  let x = 160;
  let prevX = x;
  return {
    id: "play",
    update(dt) {
      prevX = x;
      x += axis(keys, ["ArrowLeft", "KeyA"], ["ArrowRight", "KeyD"]) * tuning.values.speed * dt;
      x = Math.min(Math.max(x, 0), game.width);
      keys.endStep();
    },
    render(ctx, alpha) {
      const s = tuning.values.size;
      const drawX = prevX + (x - prevX) * alpha;
      ctx.fillStyle = "#ff5c8a";
      ctx.fillRect(Math.round(drawX - s / 2), game.height - 40 - s, s, s);
    },
  };
})();

game.add(play).go("play");
game.start();

// Dev-only inspection hook for agents and browser tooling. Vite strips this branch
// from production builds; `debuff build` verifies it.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__DEBUFF_DEV__ = {
    game,
    keys,
    describeParams: () => game.params.describe(),
  };
}
