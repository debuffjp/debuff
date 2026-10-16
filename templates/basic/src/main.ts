import { Audio } from "@debuff/audio";
import { approach, clamp, Game, type Scene, Storage } from "@debuff/core";
import { devTools } from "@debuff/dev";
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

  render(ctx) {
    game.camera.apply(ctx);
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(player.scaleX, player.scaleY);
    ctx.fillStyle = "#a3e635";
    ctx.fillRect(-8, -16, 16, 16);
    ctx.restore();
    particles.draw(ctx);
    ctx.restore();
  },

  // Snapshot for scenarios and agents (dev only).
  inspect() {
    return { player: { x: Math.round(player.x), vx: Math.round(player.vx) }, pops: save.get("pops"), particles: particles.count };
  },
};

game.add(play).go("play");
game.start();

// Dev-only plugin: exposes window.__DEBUFF_DEV__ for scenarios and agents. Stripped from production.
if (import.meta.env.DEV) game.use(devTools({ input }));
