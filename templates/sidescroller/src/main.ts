import { Assets } from "@debuffjp/assets";
import { Audio } from "@debuffjp/audio";
import { approach, Game, lerp, overlaps, type Scene, Sprite, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles, squash, Tweens } from "@debuffjp/juice";
import { type Body, Tilemap } from "@debuffjp/tilemap";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

// The level, one character per 16px tile. Change it and the map, collision and pickups follow.
const LEVEL = [
  "............................................................",
  "............................................................",
  "............................................................",
  "...................*.............................*..........",
  "..................===..................BBB......===.........",
  "..............*..........*.........*.........*..............",
  ".............===.......=====......===.......===.............",
  "....@.................................B.............*.......",
  "###########.....####...........####################.....####",
  "###########.....####...........####################.....####",
  "###########.....####...........####################.....####",
  "###########.....####...........####################.....####",
];
const TILE = 16;
// Tile ids: 0 is empty, then the frames of assets/tiles.tt in order.
const GROUND_TOP = 1;
const GROUND = 2;
const PLANK = 3;
const BLOCK = 4;

const game = new Game({ canvas, width: 320, height: 180, background: "#11140d", pixelArt: true });
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
const save = new Storage("debuff-sidescroller", { best: 0 });

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

const map = new Tilemap({
  width: LEVEL[0]?.length ?? 0,
  height: LEVEL.length,
  tileWidth: TILE,
  tileHeight: TILE,
  layers: ["ground"],
  tilesets: [
    {
      firstId: 1,
      image: assets.frame("tiles"),
      tileWidth: TILE,
      tileHeight: TILE,
      columns: 4,
      count: 4,
      properties: {
        [GROUND_TOP - 1]: { solid: true },
        [GROUND - 1]: { solid: true },
        [PLANK - 1]: { oneWay: true },
        [BLOCK - 1]: { solid: true },
      },
    },
  ],
});
// Walls at the sides, open above and below so buff can jump high and fall into pits.
map.edges = { left: true, right: true, top: false, bottom: false };

interface Spark {
  x: number;
  y: number;
  taken: boolean;
}
const sparks: Spark[] = [];
let spawn = { x: TILE, y: TILE };
LEVEL.forEach((row, r) => {
  for (let c = 0; c < row.length; c++) {
    const ch = row[c] ?? ".";
    const above = LEVEL[r - 1]?.[c] ?? ".";
    const id = ch === "#" ? (above === "#" ? GROUND : GROUND_TOP) : ch === "=" ? PLANK : ch === "B" ? BLOCK : 0;
    map.set("ground", c, r, id);
    if (ch === "*") sparks.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, taken: false });
    if (ch === "@") spawn = { x: c * TILE + 2, y: r * TILE + 3 };
  }
});
map.collideFrom(["ground"]);
game.camera.bounds = { x: 0, y: 0, width: map.pixelWidth, height: map.pixelHeight };
game.camera.deadzone = { x: 24, y: 16 };
game.camera.lerp = 10;

// ---- the player -------------------------------------------------------------------------------------

const body: Body = { x: spawn.x, y: spawn.y, w: 12, h: 13 };
const prev = { x: body.x, y: body.y };
const player = { vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, facing: 1, scaleX: 1, scaleY: 1 };

// Frame order follows the tags in assets/buff.tt. A side-scroller only needs the side-facing frames.
const buff = new Sprite({
  frames: assets.frames("buff"),
  origin: "bottom-center",
  animations: {
    idle: { frames: [6], fps: 1 },
    walk: { frames: [7, 8], fps: 8, loop: true },
    jump: { frames: [7], fps: 1 },
  },
});
buff.play("idle");
const sparkFrames = assets.frames("spark");
const cameraTarget = { x: 0, y: 0 };
const centre = () => ({ x: body.x + body.w / 2, y: body.y + body.h / 2 });
let collected = 0;

function reset(): void {
  body.x = spawn.x;
  body.y = spawn.y;
  prev.x = body.x;
  prev.y = body.y;
  player.vx = player.vy = 0;
  for (const s of sparks) s.taken = false;
  collected = 0;
  cameraTarget.x = centre().x;
  cameraTarget.y = centre().y;
  game.camera.follow(cameraTarget, true);
}

const play: Scene = {
  id: "play",

  enter() {
    reset();
  },

  update(dt) {
    prev.x = body.x;
    prev.y = body.y;
    const t = tuning.values;
    const dir = input.axis("left", "right");
    if (dir) player.facing = dir;
    player.vx = approach(player.vx, dir * t.runSpeed, (player.onGround ? t.accel : t.airAccel) * dt);

    // Coyote time and jump buffering make jumps feel fair.
    player.coyote = player.onGround ? t.coyote : player.coyote - dt;
    player.buffer = input.pressed("jump") ? t.jumpBuffer : player.buffer - dt;
    if (player.buffer > 0 && player.coyote > 0) {
      player.vy = -t.jumpSpeed;
      player.buffer = player.coyote = 0;
      if (!game.reducedMotion) squash(tweens, player, -0.25);
      audio.synth({ freq: 380, freqEnd: 760, decay: 0.12, volume: 0.15 });
    }
    if (!input.down("jump") && player.vy < 0) player.vy *= t.jumpCut ** (dt * 20);

    player.vy = Math.min(player.vy + t.gravity * dt, 500);
    const wasGround = player.onGround;
    const impact = player.vy;
    const hit = map.move(body, player.vx * dt, player.vy * dt, { dropThrough: input.down("down"), oneWayTolerance: 4 });
    if (hit.hitX) player.vx = 0;
    if (hit.hitY) player.vy = 0;
    player.onGround = hit.onGround;
    if (player.onGround && !wasGround && impact > 200) {
      if (!game.reducedMotion) squash(tweens, player, Math.min(0.35, impact / 1200));
      particles.emit({
        x: centre().x,
        y: body.y + body.h,
        count: 6,
        angle: -Math.PI / 2,
        spread: 2.4,
        speed: [20, 60],
        life: [0.2, 0.4],
        colors: ["#cffb2d", "#7dffb3"],
        size: [2, 4],
        shape: "circle",
        gravity: 300,
      });
    }

    buff.play(!player.onGround ? "jump" : dir ? "walk" : "idle");
    buff.flipX = player.facing < 0;
    buff.update(dt);

    for (const s of sparks) {
      if (s.taken || !overlaps(body, { x: s.x - 4, y: s.y - 4, w: 8, h: 8 })) continue;
      s.taken = true;
      collected++;
      if (collected > save.get("best")) save.set("best", collected);
      // Tests and agents can wait for this: `events.spark` in scenarios, `game.emitted("spark")` in keiko.
      game.emit("spark");
      particles.emit({ x: s.x, y: s.y, count: 8, colors: ["#ff9f43"], size: [2, 4], shape: "circle", speed: [30, 90], life: [0.25, 0.5] });
      audio.synth({ freq: 880, freqEnd: 1320, decay: 0.1, volume: 0.12 });
    }

    // Falling off the map restarts the level.
    if (body.y > map.pixelHeight + 32) {
      game.camera.shake(0.5);
      game.freeze(0.12);
      audio.synth({ wave: "noise", freq: 400, freqEnd: 80, decay: 0.3, volume: 0.2 });
      reset();
    }

    // The camera looks a little ahead of where buff faces.
    cameraTarget.x = centre().x + player.facing * 16;
    cameraTarget.y = centre().y;
    tweens.update(dt);
    particles.update(dt);
  },

  render(draw, alpha) {
    draw.withCamera(game.camera, () => {
      map.draw(draw, { camera: game.camera });
      const sparkFrame = sparkFrames[Math.floor(game.clock.time * 4) % sparkFrames.length];
      for (const s of sparks) if (!s.taken && sparkFrame) draw.sprite(sparkFrame, s.x, s.y);
      buff.x = lerp(prev.x, body.x, alpha) + body.w / 2;
      buff.y = lerp(prev.y, body.y, alpha) + body.h;
      buff.scaleX = player.scaleX;
      buff.scaleY = player.scaleY;
      buff.draw(draw);
      particles.draw(draw);
    });
    draw.rect(0, 0, 72, 24, "#11140d");
    draw.text(`sparks ${collected}/${sparks.length}`, 4, 4, { color: "#d3dcc2" });
    draw.text(`best ${save.get("best")}`, 4, 14, { color: "#d3dcc2" });
  },

  inspect() {
    return {
      player: {
        x: Math.round(body.x),
        y: Math.round(body.y),
        vx: Math.round(player.vx),
        vy: Math.round(player.vy),
        onGround: player.onGround,
        facing: player.facing,
      },
      collected,
      sparks: sparks.filter((s) => !s.taken).map((s) => ({ x: s.x, y: s.y })),
    };
  },
};

game.add(play).go("play");
game.start();

if (import.meta.env.DEV) {
  game
    .use(
      devTools({
        input,
        // `warp col row` stands buff on a tile. Tests, scenarios and agents use it to skip the run.
        commands: {
          warp: (col: number, row: number) => {
            body.x = col * TILE + 2;
            body.y = row * TILE + 3;
            prev.x = body.x;
            prev.y = body.y;
            player.vx = player.vy = 0;
          },
        },
      }),
    )
    .use(devOverlay());
}
