import { Assets } from "@debuffjp/assets";
import { Audio } from "@debuffjp/audio";
import { approach, Game, lerp, overlaps, type Scene, Sprite, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles, squash, Tweens } from "@debuffjp/juice";
import { type Body, Tilemap } from "@debuffjp/tilemap";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

// The world, one character per 16px tile. Change it and the map, collision and pickups follow.
const LEVEL = [
  "##############################",
  "#............~~~.............#",
  "#..*.........~~~......*......#",
  "#............~~~.............#",
  "#.....----------------.......#",
  "#.....-..............-.......#",
  "#.....-...###........-...*...#",
  "#.....-...#*#........-.......#",
  "#.....-...#.#........-.......#",
  "#.....-...#.####.....-.......#",
  "#.....-..........@...-.......#",
  "#.....----------------.......#",
  "#............................#",
  "#.*......~~~~........######..#",
  "#........~~~~........#....#..#",
  "#........~~~~........#.*..#..#",
  "#....................#....#..#",
  "#..........*.........##.###..#",
  "#............................#",
  "##############################",
];
const TILE = 16;
// Tile ids: 0 is empty, then the frames of assets/tiles.tt in order.
const GRASS = 1;
const WALL = 2;
const WATER = 3;
const PATH = 4;
const TILE_FOR: Record<string, number> = { "#": WALL, "~": WATER, "-": PATH };

const game = new Game({ canvas, width: 320, height: 180, background: "#11140d", pixelArt: true });
const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    up: ["ArrowUp", "KeyW", "PadUp", "PadStickUp"],
    down: ["ArrowDown", "KeyS", "PadDown", "PadStickDown"],
  },
});
const audio = new Audio();
const tweens = new Tweens();
const particles = new Particles(() => game.random.next());
const save = new Storage("debuff-topdown", { best: 0 });

const tuning = game.params.define("player", {
  speed: { type: "number", default: 90, min: 10, max: 300, units: "px/s" },
  accel: { type: "number", default: 900, min: 100, max: 5000, units: "px/s²" },
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
      properties: { [WALL - 1]: { solid: true }, [WATER - 1]: { solid: true } },
    },
  ],
});
map.edges = { left: true, right: true, top: true, bottom: true };

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
    map.set("ground", c, r, TILE_FOR[ch] ?? GRASS);
    if (ch === "*") sparks.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, taken: false });
    if (ch === "@") spawn = { x: c * TILE + 3, y: r * TILE + 6 };
  }
});
map.collideFrom(["ground"]);
game.camera.bounds = { x: 0, y: 0, width: map.pixelWidth, height: map.pixelHeight };

// ---- the player -------------------------------------------------------------------------------------

// The collision box is a little smaller than the sprite and sits at its feet, so buff slips through
// one-tile gaps and its head can overlap the wall above.
const body: Body = { x: spawn.x, y: spawn.y, w: 10, h: 8 };
const prev = { x: body.x, y: body.y };
const player = { vx: 0, vy: 0, facing: "down" as "down" | "up" | "side", flip: false, scaleX: 1, scaleY: 1 };

// Frame order follows the tags in assets/buff.tt: idle then two walk frames for down, up and side.
const buff = new Sprite({
  frames: assets.frames("buff"),
  origin: "bottom-center",
  animations: {
    "idle-down": { frames: [0], fps: 1 },
    "walk-down": { frames: [1, 2], fps: 8, loop: true },
    "idle-up": { frames: [3], fps: 1 },
    "walk-up": { frames: [4, 5], fps: 8, loop: true },
    "idle-side": { frames: [6], fps: 1 },
    "walk-side": { frames: [7, 8], fps: 8, loop: true },
  },
});
buff.play("idle-down");
const sparkFrames = assets.frames("spark");
const cameraTarget = { x: 0, y: 0 };

const centre = (b: Body) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
let collected = 0;

const play: Scene = {
  id: "play",

  enter() {
    cameraTarget.x = centre(body).x;
    cameraTarget.y = centre(body).y;
    game.camera.follow(cameraTarget);
  },

  update(dt) {
    prev.x = body.x;
    prev.y = body.y;

    // Keys and sticks give a direction; a touch or click walks toward that point.
    let dx = input.axis("left", "right");
    let dy = input.axis("up", "down");
    if (input.pointer.down) {
      const target = game.camera.toWorld(input.pointer.x, input.pointer.y);
      const c = centre(body);
      const far = Math.hypot(target.x - c.x, target.y - c.y);
      if (far > 4) {
        dx = (target.x - c.x) / far;
        dy = (target.y - c.y) / far;
      }
    }
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    player.vx = approach(player.vx, dx * tuning.values.speed, tuning.values.accel * dt);
    player.vy = approach(player.vy, dy * tuning.values.speed, tuning.values.accel * dt);
    const hit = map.move(body, player.vx * dt, player.vy * dt);
    if (hit.hitX) player.vx = 0;
    if (hit.hitY) player.vy = 0;

    const moving = len > 0.1;
    if (moving) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        player.facing = "side";
        player.flip = dx < 0;
      } else player.facing = dy < 0 ? "up" : "down";
    }
    buff.play(`${moving ? "walk" : "idle"}-${player.facing}`);
    buff.flipX = player.flip;
    buff.update(dt);

    const c = centre(body);
    for (const s of sparks) {
      if (s.taken || !overlaps(body, { x: s.x - 4, y: s.y - 4, w: 8, h: 8 })) continue;
      s.taken = true;
      collected++;
      if (collected > save.get("best")) save.set("best", collected);
      game.emit("spark");
      squash(tweens, player, 0.3);
      particles.emit({ x: s.x, y: s.y, count: 12, colors: ["#ff9f43", "#d3dcc2"], shape: "circle", size: [1, 3], gravity: 120 });
      audio.synth({ freq: 880, freqEnd: 1320, decay: 0.12 });
    }

    // The camera eases toward buff instead of locking on, so walls scroll into view a beat before buff reaches them.
    cameraTarget.x = lerp(cameraTarget.x, c.x, 1 - 0.05 ** dt);
    cameraTarget.y = lerp(cameraTarget.y, c.y, 1 - 0.05 ** dt);
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
    // The HUD sits on an ink panel so it stays readable over any tile.
    draw.rect(0, 0, 72, 24, "#11140d");
    draw.text(`sparks ${collected}/${sparks.length}`, 4, 4, { color: "#d3dcc2" });
    draw.text(`best ${save.get("best")}`, 4, 14, { color: "#d3dcc2" });
  },

  inspect() {
    return {
      player: { x: Math.round(body.x), y: Math.round(body.y), facing: player.facing, flip: player.flip },
      sparks: { collected, total: sparks.length },
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
        // `warp col row` puts buff on a tile. Tests, scenarios and agents use it to skip the walk.
        commands: {
          warp: (col: number, row: number) => {
            body.x = col * TILE + 3;
            body.y = row * TILE + 6;
            prev.x = body.x;
            prev.y = body.y;
          },
        },
      }),
    )
    .use(devOverlay());
}
