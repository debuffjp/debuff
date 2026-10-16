import { Audio } from "@debuff/audio";
import { exposeDevHooks } from "@debuff/dev";
import { Game, Storage, approach, type Scene } from "@debuff/core";
import { Keyboard, Pointer, axis } from "@debuff/input";
import { Particles, Tweens, squash } from "@debuff/juice";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const game = new Game({ canvas, width: 320, height: 180, background: "#14141f" });
const keys = new Keyboard();
const pointer = new Pointer(canvas, { width: game.width, height: game.height });
const audio = new Audio();
const tweens = new Tweens();
const particles = new Particles(() => game.random.next());
const save = new Storage("my-game", { taps: 0 });

// Tune these live from the console: __DEBUFF_DEV__.game.params.group("player").set("speed", 300)
const tuning = game.params.define("player", {
  speed: { type: "number", default: 140, min: 0, max: 600, units: "px/s" },
  accel: { type: "number", default: 1200, min: 0, max: 5000, units: "px/s²" },
});

game.afterUpdate(() => {
  keys.endStep();
  pointer.endStep();
});

const player = { x: 160, y: 120, vx: 0, scaleX: 1, scaleY: 1 };

const play: Scene = {
  id: "play",
  update(dt) {
    let dir = axis(keys, ["ArrowLeft", "KeyA"], ["ArrowRight", "KeyD"]);
    if (pointer.held) dir = Math.sign(pointer.x - player.x);
    player.vx = approach(player.vx, dir * tuning.values.speed, tuning.values.accel * dt);
    player.x = Math.min(Math.max(player.x + player.vx * dt, 8), game.width - 8);

    if (keys.pressed("Space") || pointer.pressed) {
      save.set("taps", save.get("taps") + 1);
      squash(tweens, player, 0.35);
      particles.emit({ x: player.x, y: player.y, count: 16, colors: ["#ffd166", "#ef476f"], gravity: 200 });
      game.camera.shake(0.3);
      audio.synth({ freq: 660, freqEnd: 220, decay: 0.15 });
    }
    tweens.update(dt);
    particles.update(dt);
  },
  inspect() {
    return { player: { x: Math.round(player.x), vx: Math.round(player.vx) }, taps: save.get("taps"), particles: particles.count };
  },
  render(ctx) {
    game.camera.apply(ctx);
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(player.scaleX, player.scaleY);
    ctx.fillStyle = "#06d6a0";
    ctx.fillRect(-8, -16, 16, 16);
    ctx.restore();
    particles.draw(ctx);
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = "8px monospace";
    ctx.fillText(`taps: ${save.get("taps")}   arrows/touch to move, space/tap to pop`, 6, 12);
  },
};

game.add(play).go("play");
game.start();

// Dev-only: exposes window.__DEBUFF_DEV__ for scenarios and agents. Stripped from production.
if (import.meta.env.DEV) {
  exposeDevHooks(game, { keys, pointer });
}
