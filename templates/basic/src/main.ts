import { Audio } from "@debuffjp/audio";
import { approach, clamp, type Draw, Game, lerp, type Scene, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles, squash, Tweens } from "@debuffjp/juice";

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

// prevX is where buff was a step ago: render blends toward x so motion stays smooth on fast displays.
// hop is how high buff is off the floor, for the little jump on each pop.
const player = { x: 160, prevX: 160, y: 132, vx: 0, scaleX: 1, scaleY: 1, hop: 0 };

const INK = "#11140d";
const LIME = "#cffb2d";

/** A rectangle with round corners, from rects and circles. */
function roundRect(draw: Draw, x: number, y: number, w: number, h: number, r: number, colour: string) {
  draw.rect(x + r, y, w - 2 * r, h, colour);
  draw.rect(x, y + r, w, h - 2 * r, colour);
  for (const [cx, cy] of [
    [x + r, y + r],
    [x + w - r, y + r],
    [x + r, y + h - r],
    [x + w - r, y + h - r],
  ] as const)
    draw.circle(cx, cy, r, colour);
}

const play: Scene = {
  id: "play",

  update(dt) {
    player.prevX = player.x;
    let dir = input.axis("left", "right");
    if (input.pointer.down) dir = Math.sign(input.pointer.x - player.x);
    player.vx = approach(player.vx, dir * tuning.values.speed, tuning.values.accel * dt);
    player.x = clamp(player.x + player.vx * dt, 8, game.width - 8);

    if (input.pressed("pop")) {
      save.set("pops", save.get("pops") + 1);
      squash(tweens, player, 0.35);
      // A little hop: up fast, down with a bounce. squash() only touches scale, so both play together.
      tweens.to(
        player,
        { hop: 14 },
        { duration: 0.12, ease: "outQuad", onComplete: () => tweens.to(player, { hop: 0 }, { duration: 0.3, ease: "outBounce" }) },
      );
      particles.emit({
        x: player.x,
        y: player.y - 14,
        count: 16,
        colors: [LIME, "#38bdf8", "#f472b6"],
        shape: "circle",
        size: [3, 6],
        gravity: 300,
      });
      game.camera.shake(0.3);
      audio.synth({ freq: 660, freqEnd: 220, decay: 0.15 });
    }
    // Idle jiggle: buff breathes a little while nothing else is squashing it.
    if (!tweens.has(player, "scaleX") && !game.reducedMotion) {
      const s = Math.sin(game.clock.time * 3) * 0.04;
      player.scaleX = 1 + s;
      player.scaleY = 1 - s;
    }
    tweens.update(dt);
    particles.update(dt);
  },

  render(draw, alpha) {
    draw.withCamera(game.camera, () => {
      // The floor: a soft rounded slab.
      roundRect(draw, 6, player.y, game.width - 12, 30, 10, "#1b2014");

      // buff, the debuff mascot: a flat jelly block with pill eyes, squashing and stretching from its feet.
      draw.push();
      draw.translate(lerp(player.prevX, player.x, alpha), player.y - player.hop);
      draw.scale(player.scaleX, player.scaleY);
      roundRect(draw, -11, -4, 8, 5, 2.5, LIME); // feet
      roundRect(draw, 3, -4, 8, 5, 2.5, LIME);
      roundRect(draw, -14, -27, 28, 25, 9, LIME);
      roundRect(draw, -8, -20, 5, 8, 2.5, INK); // pill eyes, like the brand buff
      roundRect(draw, 3, -20, 5, 8, 2.5, INK);
      draw.pop();
      particles.draw(draw);
    });
    // debuff sans, the built-in pixel font, at 2x.
    draw.push();
    draw.scale(2);
    draw.text(`pops ${save.get("pops")}`, 6, 5, { color: "#d3dcc2" });
    draw.pop();
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
