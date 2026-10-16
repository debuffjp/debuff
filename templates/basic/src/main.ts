import { Audio } from "@debuff/audio";
import { approach, clamp, Game, type Scene, Storage } from "@debuff/core";
import { devOverlay, devTools } from "@debuff/dev";
import { Input } from "@debuff/input";
import { Particles, squash, Tweens } from "@debuff/juice";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

const game = new Game({ canvas, width: 320, height: 180, background: "#11140d" });
const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    pop: ["Space", "PadA", "Pointer"],
  },
});
const audio = new Audio();
const tweens = new Tweens();
const particles = new Particles(() => game.random.next());
const save = new Storage("my-game", { pops: 0 });

// Creative parameters: typed, ranged and live-tunable.
// Try in the console: __DEBUFF_DEV__.setParam("player", "speed", 300)
const tuning = game.params.define("player", {
  speed: { type: "number", default: 140, min: 0, max: 600, units: "px/s" },
  accel: { type: "number", default: 1200, min: 0, max: 5000, units: "px/s²" },
});

const player = { x: 160, y: 120, vx: 0, scaleX: 1, scaleY: 1 };

const play: Scene = {
  id: "play",

  update(dt) {
    let dir = input.axis("left", "right");
    if (input.pointer.down) dir = Math.sign(input.pointer.x - player.x);
    player.vx = approach(player.vx, dir * tuning.values.speed, tuning.values.accel * dt);
    player.x = clamp(player.x + player.vx * dt, 8, game.width - 8);

    if (input.pressed("pop")) {
      save.set("pops", save.get("pops") + 1);
      squash(tweens, player, 0.35);
      particles.emit({ x: player.x, y: player.y - 8, count: 16, colors: ["#a3e635", "#ecfccb"], gravity: 200 });
      game.camera.shake(0.3);
      audio.synth({ freq: 660, freqEnd: 220, decay: 0.15 });
    }
    tweens.update(dt);
    particles.update(dt);
  },

  render(draw) {
    draw.withCamera(game.camera, () => {
      // buff, the debuff mascot: a lime block with eyes, squashing from its feet.
      draw.push();
      draw.translate(player.x, player.y);
      draw.scale(player.scaleX, player.scaleY);
      draw.rect(-8, -16, 16, 16, "#a3e635");
      draw.rect(-5, -12, 3, 4, "#11140d");
      draw.rect(2, -12, 3, 4, "#11140d");
      draw.pop();
      particles.draw(draw);
    });
  },

  // Snapshot for scenarios and agents (dev only).
  inspect() {
    return { player: { x: Math.round(player.x), vx: Math.round(player.vx) }, pops: save.get("pops"), particles: particles.count };
  },
};

game.add(play).go("play");
game.start();

// Dev-only plugins: window.__DEBUFF_DEV__ for scenarios and agents, and an overlay (toggle with `) with
// a frame-time graph and live sliders for every param. Both are stripped from production builds.
if (import.meta.env.DEV) game.use(devTools({ input })).use(devOverlay());
