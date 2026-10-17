import { Game, type Scene } from "@debuffjp/core";
import { devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";

// A tiny game for the runner's own tests: a dot that walks right while the key is held.
const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("no canvas");
const game = new Game({ canvas, width: 64, height: 64 });
const input = new Input(game, { bindings: { right: ["ArrowRight"], crash: ["KeyC"] } });
const tuning = game.params.define("dot", { speed: { type: "number", default: 60, min: 0, max: 600 } });
const dot = { x: 0 };

const play: Scene = {
  id: "play",
  update(dt) {
    if (input.down("right")) dot.x += tuning.values.speed * dt;
    if (input.pressed("crash")) throw new Error("the dot fell over");
  },
  render(draw) {
    draw.rect(dot.x, 30, 4, 4, "#cffb2d");
  },
  inspect: () => ({ x: Math.round(dot.x), random: Math.random() < 2 }),
};

game.add(play).go("play");
game.start();
game.use(devTools({ input, commands: { teleport: (x: number) => (dot.x = x) } }));
