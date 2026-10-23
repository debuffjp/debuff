import { Assets } from "@debuffjp/assets";
import { Audio } from "@debuffjp/audio";
import { approach, clamp, Game, lerp, type Scene, Sprite, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles, squash, Tweens } from "@debuffjp/juice";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

// The world, one character per cell. Change it and the floor, blocks and pickups follow.
const LEVEL = [
  "############",
  "#..........#",
  "#..*.#.....#",
  "#....#...*.#",
  "#.---------#",
  "#.-..#...#.#",
  "#.-..#.@.#.#",
  "#.-......#.#",
  "#.-*.....*.#",
  "#.---------#",
  "#..........#",
  "############",
];
// Frames of assets/tiles.tt, in order.
const FLOOR = 0;
const PATH = 1;
const BLOCK = 2;
const TILE_FOR: Record<string, number> = { "#": BLOCK, "-": PATH };
// A cell is a 2:1 diamond: 32 screen pixels wide, 16 tall.
const CELL_W = 32;
const CELL_H = 16;

/** Grid units to screen pixels. (gx, gy) is a point on the floor; whole numbers are cell corners. */
const toScreen = (gx: number, gy: number) => ({ x: ((gx - gy) * CELL_W) / 2, y: ((gx + gy) * CELL_H) / 2 });
/** Screen pixels to grid units, the inverse of toScreen. */
const toGrid = (x: number, y: number) => ({ gx: x / CELL_W + y / CELL_H, gy: y / CELL_H - x / CELL_W });

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
const save = new Storage("debuff-isometric", { best: 0 });

const tuning = game.params.define("player", {
  speed: {
    type: "number",
    default: 70,
    min: 10,
    max: 300,
    units: "px/s",
    description: "On screen; walking toward the camera looks slower",
  },
  accel: { type: "number", default: 700, min: 100, max: 5000, units: "px/s²" },
});

// ---- load assets ------------------------------------------------------------------------------------

const assets = new Assets(await (await fetch("assets/manifest.json")).json());
await assets.load();
const tileFrames = assets.frames("tiles");
const sparkFrames = assets.frames("spark");

const COLS = LEVEL[0]?.length ?? 0;
const ROWS = LEVEL.length;
const cells: number[] = [];
interface Spark {
  gx: number;
  gy: number;
  taken: boolean;
}
const sparks: Spark[] = [];
let spawn = { gx: 1.5, gy: 1.5 };
LEVEL.forEach((row, gy) => {
  for (let gx = 0; gx < row.length; gx++) {
    const ch = row[gx] ?? ".";
    cells.push(TILE_FOR[ch] ?? FLOOR);
    if (ch === "*") sparks.push({ gx: gx + 0.5, gy: gy + 0.5, taken: false });
    if (ch === "@") spawn = { gx: gx + 0.5, gy: gy + 0.5 };
  }
});
const cellAt = (gx: number, gy: number) =>
  gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS ? BLOCK : (cells[Math.floor(gy) * COLS + Math.floor(gx)] ?? BLOCK);
const blocked = (gx: number, gy: number) => cellAt(gx, gy) === BLOCK;

// ---- the player -------------------------------------------------------------------------------------

// buff is a point on the floor with a small square footprint, in grid units.
const FOOT = 0.3;
const player = { gx: spawn.gx, gy: spawn.gy, vx: 0, vy: 0, facing: "down" as "down" | "up" | "side", flip: false, scaleX: 1, scaleY: 1 };
const prev = { gx: player.gx, gy: player.gy };

/** Move one grid axis at a time and stop at blocks, so buff slides along walls. */
function moveGrid(dgx: number, dgy: number): { hitX: boolean; hitY: boolean } {
  const hit = { hitX: false, hitY: false };
  const free = (gx: number, gy: number) =>
    !blocked(gx - FOOT, gy - FOOT) && !blocked(gx + FOOT, gy - FOOT) && !blocked(gx - FOOT, gy + FOOT) && !blocked(gx + FOOT, gy + FOOT);
  if (free(player.gx + dgx, player.gy)) player.gx += dgx;
  else hit.hitX = true;
  if (free(player.gx, player.gy + dgy)) player.gy += dgy;
  else hit.hitY = true;
  return hit;
}

// The same frame order as the top-down template: idle then two walk frames for down, up and side.
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

const cameraTarget = { x: 0, y: 0 };
const world = toScreen(COLS, ROWS);
const left = toScreen(0, ROWS).x;
game.camera.bounds = { x: left - 16, y: -16, width: world.x - left * 2 + 32, height: world.y + 48 };
let collected = 0;

/** Things drawn on the grid, back to front. */
interface Drawable {
  depth: number;
  draw(): void;
}
const drawables: Drawable[] = [];

const play: Scene = {
  id: "play",

  enter() {
    const p = toScreen(player.gx, player.gy);
    cameraTarget.x = p.x;
    cameraTarget.y = p.y;
    game.camera.follow(cameraTarget);
  },

  update(dt) {
    prev.gx = player.gx;
    prev.gy = player.gy;

    // Input is in screen directions (right is right on screen); a touch or click walks toward that point.
    let dx = input.axis("left", "right");
    let dy = input.axis("up", "down");
    if (input.pointer.down) {
      const target = game.camera.toWorld(input.pointer.x, input.pointer.y);
      const here = toScreen(player.gx, player.gy);
      const far = Math.hypot(target.x - here.x, target.y - here.y);
      if (far > 4) {
        dx = (target.x - here.x) / far;
        dy = (target.y - here.y) / far;
      }
    }
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    player.vx = approach(player.vx, dx * tuning.values.speed, tuning.values.accel * dt);
    player.vy = approach(player.vy, dy * tuning.values.speed, tuning.values.accel * dt);
    // Velocity is in screen pixels; the grid step is its projection back onto the floor.
    const step = toGrid(player.vx * dt, player.vy * dt);
    const hit = moveGrid(step.gx, step.gy);
    if (hit.hitX || hit.hitY) {
      // Stop the screen velocity that pushed into the wall, keep the part that slides along it.
      const kept = toScreen(hit.hitX ? 0 : step.gx, hit.hitY ? 0 : step.gy);
      player.vx = dt > 0 ? kept.x / dt : 0;
      player.vy = dt > 0 ? kept.y / dt : 0;
    }

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

    for (const s of sparks) {
      if (s.taken || Math.abs(s.gx - player.gx) > 0.5 || Math.abs(s.gy - player.gy) > 0.5) continue;
      s.taken = true;
      collected++;
      if (collected > save.get("best")) save.set("best", collected);
      game.emit("spark");
      squash(tweens, player, 0.3);
      const at = toScreen(s.gx, s.gy);
      particles.emit({ x: at.x, y: at.y - 4, count: 12, colors: ["#ff9f43", "#d3dcc2"], shape: "circle", size: [1, 3], gravity: 120 });
      audio.synth({ freq: 880, freqEnd: 1320, decay: 0.12 });
    }

    const here = toScreen(player.gx, player.gy);
    cameraTarget.x = lerp(cameraTarget.x, here.x, 1 - 0.05 ** dt);
    cameraTarget.y = lerp(cameraTarget.y, here.y, 1 - 0.05 ** dt);
    tweens.update(dt);
    particles.update(dt);
  },

  render(draw, alpha) {
    draw.withCamera(game.camera, () => {
      // Flat tiles first, in row order. Nothing stands on them, so they need no sorting.
      for (let gy = 0; gy < ROWS; gy++)
        for (let gx = 0; gx < COLS; gx++) {
          const tile = cells[gy * COLS + gx] ?? FLOOR;
          if (tile === BLOCK) continue;
          const frame = tileFrames[tile];
          const at = toScreen(gx + 0.5, gy + 0.5);
          if (frame) draw.sprite(frame, at.x, at.y, { origin: [0.5, 0.75] });
        }

      // Then everything with height, back to front: a thing further down the screen (larger gx + gy) is in front.
      drawables.length = 0;
      const block = tileFrames[BLOCK];
      for (let gy = 0; gy < ROWS; gy++)
        for (let gx = 0; gx < COLS; gx++) {
          if (cells[gy * COLS + gx] !== BLOCK || !block) continue;
          const at = toScreen(gx + 0.5, gy + 0.5);
          drawables.push({ depth: gx + gy + 1, draw: () => draw.sprite(block, at.x, at.y, { origin: [0.5, 0.75] }) });
        }
      const sparkFrame = sparkFrames[Math.floor(game.clock.time * 4) % sparkFrames.length];
      for (const s of sparks) {
        if (s.taken || !sparkFrame) continue;
        const at = toScreen(s.gx, s.gy);
        drawables.push({ depth: s.gx + s.gy, draw: () => draw.sprite(sparkFrame, at.x, at.y - 6) });
      }
      const gx = lerp(prev.gx, player.gx, alpha);
      const gy = lerp(prev.gy, player.gy, alpha);
      const at = toScreen(gx, gy);
      drawables.push({
        depth: gx + gy,
        draw: () => {
          buff.x = at.x;
          buff.y = at.y + 2;
          buff.scaleX = player.scaleX;
          buff.scaleY = player.scaleY;
          buff.draw(draw);
        },
      });
      drawables.sort((a, b) => a.depth - b.depth);
      for (const d of drawables) d.draw();
      particles.draw(draw);
    });
    draw.rect(0, 0, 72, 24, "#11140d");
    draw.text(`sparks ${collected}/${sparks.length}`, 4, 4, { color: "#d3dcc2" });
    draw.text(`best ${save.get("best")}`, 4, 14, { color: "#d3dcc2" });
  },

  inspect() {
    const at = toScreen(player.gx, player.gy);
    return {
      player: {
        gx: Math.round(player.gx * 100) / 100,
        gy: Math.round(player.gy * 100) / 100,
        x: Math.round(at.x),
        y: Math.round(at.y),
        facing: player.facing,
        flip: player.flip,
      },
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
        // `warp col row` puts buff in the middle of a cell. Tests, scenarios and agents use it to skip the walk.
        commands: {
          warp: (col: number, row: number) => {
            player.gx = clamp(col, 0, COLS - 1) + 0.5;
            player.gy = clamp(row, 0, ROWS - 1) + 0.5;
            prev.gx = player.gx;
            prev.gy = player.gy;
          },
        },
      }),
    )
    .use(devOverlay());
}
