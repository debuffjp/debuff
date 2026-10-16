import { Assets } from "@debuff/assets";
import { Audio } from "@debuff/audio";
import { approach, Game, overlaps, type Scene, Sprite, Storage } from "@debuff/core";
import { devOverlay, devTools } from "@debuff/dev";
import { Input } from "@debuff/input";
import { Particles, squash, Tweens } from "@debuff/juice";
import { fromTiled, type MapObject } from "@debuff/tilemap";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

const game = new Game({ canvas, width: 320, height: 180, pixelArt: true, scale: "integer", background: "#11140d" });
const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    jump: ["Space", "ArrowUp", "KeyW", "KeyZ", "PadA", "Pointer"],
    down: ["ArrowDown", "KeyS", "PadDown", "PadStickDown"],
  },
});
const audio = new Audio();
const tweens = new Tweens();
const particles = new Particles(() => game.random.next());
const save = new Storage("debuff-platformer", { best: 0 });

// Movement feel lives in params: tune live with the dev overlay (press `) or from agents and scenarios.
const tuning = game.params.define("player", {
  runSpeed: { type: "number", default: 110, min: 20, max: 300, units: "px/s" },
  accel: { type: "number", default: 900, min: 100, max: 4000, units: "px/s²" },
  airAccel: { type: "number", default: 600, min: 100, max: 4000, units: "px/s²" },
  gravity: { type: "number", default: 900, min: 100, max: 3000, units: "px/s²" },
  jumpSpeed: { type: "number", default: 290, min: 100, max: 600, units: "px/s" },
  jumpCut: { type: "number", default: 0.45, min: 0, max: 1, description: "Velocity kept when jump is released early" },
  coyote: { type: "number", default: 0.09, min: 0, max: 0.3, units: "s", description: "Grace time to jump after leaving a ledge" },
  jumpBuffer: { type: "number", default: 0.1, min: 0, max: 0.3, units: "s", description: "Jump pressed slightly early still counts" },
});

// ---- load assets ------------------------------------------------------------------------------------

const assets = new Assets(await (await fetch("assets/manifest.json")).json());
await assets.load();
const map = fromTiled(assets.json("level1"), { image: () => assets.frame("tiles") });
const objects = map.objects("entities");
const spawn = objects.find((o) => o.type === "Spawn") ?? { x: 32, y: 32 };
const goal = objects.find((o) => o.type === "Goal");
game.camera.bounds = { x: 0, y: 0, width: map.pixelWidth, height: map.pixelHeight };
game.camera.deadzone = { x: 24, y: 16 };
game.camera.lerp = 10;

// buff's sprite sheet rows: idle, hop, happy, oops, worried, sleepy (6 columns).
const buff = new Sprite({
  frames: assets.frames("buff"),
  origin: "bottom-center",
  animations: {
    idle: { frames: [0, 1, 2, 3], fps: 4 },
    run: { frames: [6, 7, 8, 9, 10, 11], fps: 14 },
    jump: { frames: [8], fps: 1 },
    fall: { frames: [10], fps: 1 },
    win: { frames: [12, 13], fps: 6 },
  },
});
const coinFrames = assets.frames("coin");

// ---- state --------------------------------------------------------------------------------------------

const player = { x: 0, y: 0, w: 12, h: 13, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, facing: 1, scaleX: 1, scaleY: 1 };
let coins: (MapObject & { taken: boolean })[] = [];
let score = 0;
let won = false;
const center = () => ({ x: player.x + player.w / 2, y: player.y + player.h / 2 });
const camTarget = { x: 0, y: 0 };

function reset(): void {
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = player.vy = 0;
  coins = objects.filter((o) => o.type === "Coin").map((o) => ({ ...o, taken: false }));
  score = 0;
  won = false;
  camTarget.x = center().x;
  camTarget.y = center().y;
  game.camera.follow(camTarget, true);
}

// ---- scene --------------------------------------------------------------------------------------------

const play: Scene = {
  id: "play",

  enter() {
    reset();
  },

  update(dt) {
    const t = tuning.values;
    if (!won) {
      const dir = input.axis("left", "right");
      if (dir) player.facing = dir;
      player.vx = approach(player.vx, dir * t.runSpeed, (player.onGround ? t.accel : t.airAccel) * dt);

      // Coyote time and jump buffering make jumps feel fair.
      player.coyote = player.onGround ? t.coyote : player.coyote - dt;
      player.buffer = input.pressed("jump") ? t.jumpBuffer : player.buffer - dt;
      if (player.buffer > 0 && player.coyote > 0) {
        player.vy = -t.jumpSpeed;
        player.buffer = player.coyote = 0;
        squash(tweens, player, -0.25);
        audio.synth({ freq: 380, freqEnd: 760, decay: 0.12, volume: 0.15 });
      }
      if (!input.down("jump") && player.vy < 0) player.vy *= t.jumpCut ** (dt * 20);
    } else {
      player.vx = approach(player.vx, 0, t.accel * dt);
    }

    player.vy = Math.min(player.vy + t.gravity * dt, 500);
    const wasGround = player.onGround;
    const impact = player.vy;
    const hit = map.move(player, player.vx * dt, player.vy * dt, { dropThrough: input.down("down"), oneWayTolerance: 6 });
    if (hit.hitX) player.vx = 0;
    if (hit.hitY) player.vy = 0;
    player.onGround = hit.onGround;
    if (player.onGround && !wasGround && impact > 200) {
      squash(tweens, player, Math.min(0.35, impact / 1200));
      particles.emit({
        x: center().x,
        y: player.y + player.h,
        count: 6,
        angle: -Math.PI / 2,
        spread: 2.4,
        speed: [20, 60],
        life: [0.2, 0.4],
        colors: ["#e7fd96", "#cffb2d"],
        gravity: 300,
      });
    }

    // Coins.
    for (const coin of coins) {
      if (coin.taken || !overlaps(player, { x: coin.x, y: coin.y, w: coin.width, h: coin.height })) continue;
      coin.taken = true;
      score++;
      particles.emit({ x: coin.x + 6, y: coin.y + 6, count: 12, colors: ["#fbbf24", "#fde68a"], speed: [30, 90], life: [0.25, 0.5] });
      audio.synth({ freq: 880, freqEnd: 1320, decay: 0.1, volume: 0.12 });
    }

    // Goal and pits.
    if (!won && goal && overlaps(player, { x: goal.x, y: goal.y, w: goal.width, h: goal.height })) {
      won = true;
      if (score > save.get("best")) save.set("best", score);
      game.camera.shake(0.3);
      audio.synth({ freq: 520, freqEnd: 1040, decay: 0.4, volume: 0.15 });
    }
    if (player.y > map.pixelHeight + 32) {
      game.camera.shake(0.5);
      game.freeze(0.12);
      audio.synth({ wave: "noise", freq: 400, freqEnd: 80, decay: 0.3, volume: 0.2 });
      reset();
    }
    if (won && input.pressed("jump")) reset();

    camTarget.x = center().x + player.facing * 16;
    camTarget.y = center().y;
    buff.play(won ? "win" : !player.onGround ? (player.vy < 0 ? "jump" : "fall") : Math.abs(player.vx) > 10 ? "run" : "idle");
    buff.update(dt);
    tweens.update(dt);
    particles.update(dt);
  },

  render(draw) {
    draw.withCamera(game.camera, () => {
      map.draw(draw, { camera: game.camera });
      const spin = coinFrames[Math.floor(game.clock.time * 8) % coinFrames.length];
      if (spin)
        for (const coin of coins) if (!coin.taken) draw.sprite(spin, coin.x + 6, coin.y + 6 + Math.sin(game.clock.time * 4 + coin.x) * 1.5);
      if (goal) draw.rect(goal.x + 7, goal.y, 2, goal.height, "#e7fd96");
      if (goal) draw.rect(goal.x + 9, goal.y, 10, 7, won ? "#fbbf24" : "#cffb2d");
      buff.x = Math.round(center().x);
      buff.y = Math.round(player.y + player.h);
      buff.flipX = player.facing < 0;
      buff.scaleX = player.scaleX;
      buff.scaleY = player.scaleY;
      buff.draw(draw);
      particles.draw(draw);
    });
    draw.text(`coins ${score}/${coins.length}`, 6, 5, { font: "8px monospace", color: "#fbbf24" });
    draw.text(`best ${save.get("best")}`, 314, 5, { font: "8px monospace", color: "#e7fd96", align: "right" });
    if (won) draw.text("you made it! jump to play again", 160, 80, { font: "8px monospace", color: "#cffb2d", align: "center" });
  },

  inspect: () => ({
    player: { x: Math.round(player.x), y: Math.round(player.y), onGround: player.onGround },
    score,
    coins: coins.length,
    won,
  }),
};

game.add(play).go("play");
game.start();

// Dev-only: scenario/agent hooks and the overlay (press `). Stripped from production builds.
if (import.meta.env.DEV) game.use(devTools({ input })).use(devOverlay());
