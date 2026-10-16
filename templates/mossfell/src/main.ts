import { Assets } from "@debuffjp/assets";
import { Audio } from "@debuffjp/audio";
import { Game, overlaps, type Scene, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles } from "@debuffjp/juice";
import { fromTiled, type MapObject, type Tilemap } from "@debuffjp/tilemap";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

// Moss / plum palette. Tiles and sprites in assets/ use the same colours.
const C = {
  ink: "#1a1020",
  plum: "#4a2a52",
  violet: "#8a5aa0",
  lilac: "#c8a0d8",
  cream: "#efe6cf",
  moss: "#3e5a34",
  sage: "#7a9a5a",
  pale: "#c8d6a0",
  gold: "#e0b050",
  rose: "#d0607a",
};

const HUD = 16;
const game = new Game({ canvas, width: 256, height: 176 + HUD, pixelArt: true, scale: "integer", background: C.ink });
const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    up: ["ArrowUp", "KeyW", "PadUp", "PadStickUp"],
    down: ["ArrowDown", "KeyS", "PadDown", "PadStickDown"],
    attack: ["KeyZ", "Space", "KeyJ", "PadA", "Pointer"],
  },
});
const audio = new Audio();
const particles = new Particles(() => game.random.next());
const save = new Storage("debuff-mossfell", { bestSeeds: 0, wins: 0 });

// Feel values live in params: tune live with the dev overlay (press `) or from agents and scenarios.
const tuning = game.params.define("player", {
  speed: { type: "number", default: 72, min: 20, max: 200, units: "px/s" },
  swingTime: { type: "number", default: 0.22, min: 0.05, max: 0.6, units: "s" },
  swingReach: { type: "number", default: 14, min: 6, max: 30, units: "px" },
  invulnerable: { type: "number", default: 1, min: 0, max: 3, units: "s", description: "Grace time after taking a hit" },
  knockback: { type: "number", default: 140, min: 0, max: 400, units: "px/s" },
  maxHearts: { type: "number", default: 3, min: 1, max: 10, description: "Whole hearts" },
});
const world = game.params.define("world", {
  scrollTime: { type: "number", default: 0.55, min: 0.1, max: 2, units: "s", description: "Screen-to-screen scroll" },
  fadeTime: { type: "number", default: 0.35, min: 0.05, max: 1, units: "s", description: "Stairs fade" },
  dropChance: { type: "number", default: 0.45, min: 0, max: 1, description: "Chance a defeated enemy leaves a heart or seed" },
});
const foes = game.params.define("enemies", {
  slimeSpeed: { type: "number", default: 28, min: 0, max: 120, units: "px/s" },
  mothSpeed: { type: "number", default: 42, min: 0, max: 160, units: "px/s" },
  wardenSpeed: { type: "number", default: 34, min: 0, max: 120, units: "px/s" },
  shotSpeed: { type: "number", default: 80, min: 0, max: 240, units: "px/s" },
  fireEvery: { type: "number", default: 2.2, min: 0.3, max: 6, units: "s" },
  knockback: { type: "number", default: 160, min: 0, max: 400, units: "px/s" },
});

// ---- load assets ------------------------------------------------------------------------------------

const assets = new Assets(await (await fetch("assets/manifest.json")).json());
await assets.load();
const F = assets.frames("sprites");
const frame = (i: number) => {
  const f = F[i];
  if (!f) throw new Error(`sprites has no frame ${i}`);
  return f;
};
const SPR = {
  hero: 0,
  slime: 12,
  moth: 14,
  thorn: 16,
  heart: 18,
  seed: 19,
  key: 20,
  shot: 21,
  relic: 22,
  hudFull: 23,
  hudHalf: 24,
  hudEmpty: 25,
};
const TILE = { floor: 6, door: 8, stairs: 9 };
const T = 16;
const SW = 16 * T;
const SH = 11 * T;
const DUNGEON_COL = 3;

const loadMap = (): Tilemap => fromTiled(assets.json("world"), { image: () => assets.frame("tiles") });
let map = loadMap();
const objects = map.objects("entities");
const find = (type: string): MapObject => {
  const o = objects.find((it) => it.type === type);
  if (!o) throw new Error(`world.tmj has no ${type} object`);
  return o;
};
const spawnAt = find("Spawn");
const arriveAt = find("Arrive");
const returnAt = find("Return");

// ---- state --------------------------------------------------------------------------------------------

type Dir = "down" | "up" | "left" | "right";
const DIRS: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const DIR_ROW: Record<Dir, number> = { down: 0, up: 1, left: 2, right: 3 };

type Kind = "slime" | "moth" | "thorn" | "warden";
interface Foe {
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  hp: number;
  hurt: number;
  timer: number;
  kx: number;
  ky: number;
}
interface Pickup {
  id: number;
  kind: "heart" | "seed" | "key" | "relic";
  x: number;
  y: number;
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const player = { x: 0, y: 0, w: 10, h: 10, facing: "down" as Dir, hp: 6, keys: 0, seeds: 0, swing: 0, invuln: 0, kx: 0, ky: 0, walk: 0 };
const screen = { col: 0, row: 0 };
const cam = { x: 0, y: 0 };
let scroll: { fromX: number; fromY: number; t: number; dx: number; dy: number } | undefined;
let fade: { t: number; to: MapObject; swapped: boolean } | undefined;
let foesOnScreen: Foe[] = [];
let shots: Shot[] = [];
let drops: Pickup[] = [];
const taken = new Set<number>();
let wardenDown = false;
let doorOpen = false;
let kills = 0;
let state: "play" | "won" | "lost" = "play";
let titleTime = 0;
/** Set after taking the stairs; cleared once you stand off the stairs with no direction held, so you don't bounce straight back. */
let stairsLock = false;

const screenOf = (x: number, y: number) => ({ col: Math.floor(x / SW), row: Math.floor(y / SH) });
const center = () => ({ x: player.x + player.w / 2, y: player.y + player.h / 2 });
const camFor = (col: number, row: number) => ({ x: col * SW + SW / 2, y: row * SH + SH / 2 - HUD / 2 });
const inDungeon = () => screen.col === DUNGEON_COL;
const sfx = {
  swing: () => audio.synth({ wave: "triangle", freq: 900, freqEnd: 300, decay: 0.08, volume: 0.08 }),
  hit: () => audio.synth({ wave: "square", freq: 220, freqEnd: 90, decay: 0.1, volume: 0.1 }),
  hurt: () => audio.synth({ wave: "sawtooth", freq: 300, freqEnd: 60, decay: 0.25, volume: 0.12 }),
  pickup: () => audio.synth({ freq: 660, freqEnd: 1320, decay: 0.12, volume: 0.1 }),
  door: () => audio.synth({ wave: "square", freq: 120, freqEnd: 240, decay: 0.4, volume: 0.12 }),
  stairs: () => audio.synth({ wave: "triangle", freq: 500, freqEnd: 120, decay: 0.35, volume: 0.1 }),
  win: () => audio.synth({ wave: "triangle", freq: 392, freqEnd: 1568, decay: 0.9, volume: 0.14 }),
};

function placePlayer(at: { x: number; y: number }): void {
  player.x = at.x + (T - player.w) / 2;
  player.y = at.y + (T - player.h) / 2;
  const s = screenOf(at.x + T / 2, at.y + T / 2);
  screen.col = s.col;
  screen.row = s.row;
  Object.assign(cam, camFor(s.col, s.row));
  enterScreen();
}

function reset(): void {
  map = loadMap();
  taken.clear();
  Object.assign(player, { hp: tuning.values.maxHearts * 2, keys: 0, seeds: 0, swing: 0, invuln: 0, kx: 0, ky: 0, facing: "up" });
  wardenDown = doorOpen = stairsLock = false;
  kills = 0;
  drops = [];
  state = "play";
  titleTime = 2.5;
  scroll = fade = undefined;
  placePlayer(spawnAt);
  game.camera.lerp = 0;
  game.camera.follow(cam, true);
}

/** Enemies respawn every time you walk onto a screen; pickups and the warden stay gone. */
function enterScreen(): void {
  const x0 = screen.col * SW;
  const y0 = screen.row * SH;
  const here = (o: MapObject) => o.x >= x0 && o.x < x0 + SW && o.y >= y0 && o.y < y0 + SH;
  shots = [];
  drops = drops.filter((d) => here({ x: d.x, y: d.y } as MapObject));
  foesOnScreen = [];
  for (const o of objects.filter(here)) {
    const kind = { Slime: "slime", Moth: "moth", Thorn: "thorn", Warden: "warden" }[o.type] as Kind | undefined;
    if (kind === "warden" && wardenDown) continue;
    if (kind) {
      const big = kind === "warden";
      const size = big ? 22 : 12;
      const hp = { slime: 2, moth: 1, thorn: 3, warden: 8 }[kind];
      foesOnScreen.push({
        kind,
        x: o.x + (T - size) / 2,
        y: o.y + (T - size) / 2,
        w: size,
        h: size,
        vx: 0,
        vy: 0,
        hp,
        hurt: 0,
        timer: game.random.range(0.2, 1.2),
        kx: 0,
        ky: 0,
      });
    }
  }
}

const screenRect = () => ({ x: screen.col * SW, y: screen.row * SH, w: SW, h: SH });

function damagePlayer(halves: number, fromX: number, fromY: number): void {
  if (player.invuln > 0 || state !== "play") return;
  player.hp = Math.max(0, player.hp - halves);
  player.invuln = tuning.values.invulnerable;
  const c = center();
  const d = Math.hypot(c.x - fromX, c.y - fromY) || 1;
  player.kx = ((c.x - fromX) / d) * tuning.values.knockback;
  player.ky = ((c.y - fromY) / d) * tuning.values.knockback;
  game.camera.shake(0.35);
  game.freeze(0.06);
  sfx.hurt();
  if (player.hp === 0) {
    state = "lost";
    particles.emit({ x: c.x, y: c.y, count: 24, colors: [C.violet, C.lilac, C.plum], speed: [20, 90], life: [0.4, 0.9] });
  }
}

function swordBox(): { x: number; y: number; w: number; h: number } {
  const [dx, dy] = DIRS[player.facing];
  const reach = tuning.values.swingReach;
  const c = center();
  return dx !== 0
    ? { x: dx > 0 ? player.x + player.w : player.x - reach, y: c.y - 3, w: reach, h: 6 }
    : { x: c.x - 3, y: dy > 0 ? player.y + player.h : player.y - reach, w: 6, h: reach };
}

function killFoe(f: Foe): void {
  kills++;
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  particles.emit({
    x: cx,
    y: cy,
    count: f.kind === "warden" ? 40 : 14,
    colors: [C.sage, C.pale, C.lilac],
    speed: [30, 100],
    life: [0.25, 0.6],
  });
  if (f.kind === "warden") {
    wardenDown = true;
    game.camera.shake(0.6);
    sfx.door();
    const relic = find("Relic");
    drops.push({ id: relic.id, kind: "relic", x: relic.x, y: relic.y });
  } else if (game.random.next() < world.values.dropChance) {
    const kind = game.random.next() < 0.4 ? "heart" : "seed";
    drops.push({ id: -1, kind, x: cx - T / 2, y: cy - T / 2 });
  }
}

/** Unlock a door tile the player is pushing into, if they hold a key. Opens the whole door. */
function tryDoor(): void {
  if (player.keys <= 0) return;
  const [dx, dy] = DIRS[player.facing];
  const c = center();
  const col = Math.floor((c.x + dx * (player.w / 2 + 2)) / T);
  const row = Math.floor((c.y + dy * (player.h / 2 + 2)) / T);
  if (map.get("ground", col, row) !== TILE.door) return;
  player.keys--;
  doorOpen = true;
  for (let x = col - 2; x <= col + 2; x++) {
    if (map.get("ground", x, row) !== TILE.door) continue;
    map.set("ground", x, row, TILE.floor);
    map.setCollision(x, row, 0);
    particles.emit({ x: x * T + 8, y: row * T + 8, count: 10, colors: [C.gold, C.cream], speed: [20, 60], life: [0.3, 0.6] });
  }
  game.camera.shake(0.3);
  sfx.door();
}

function updateFoes(dt: number): void {
  const v = foes.values;
  const r = screenRect();
  const c = center();
  for (const f of foesOnScreen) {
    f.hurt = Math.max(0, f.hurt - dt);
    f.timer -= dt;
    const fx = f.x + f.w / 2;
    const fy = f.y + f.h / 2;
    if (f.kind === "slime" && f.timer <= 0) {
      const d = (["down", "up", "left", "right"] as Dir[])[game.random.int(0, 3)] ?? "down";
      const still = game.random.next() < 0.25;
      f.vx = still ? 0 : DIRS[d][0] * v.slimeSpeed;
      f.vy = still ? 0 : DIRS[d][1] * v.slimeSpeed;
      f.timer = game.random.range(0.6, 1.4);
    } else if (f.kind === "moth" && f.timer <= 0) {
      const a = Math.atan2(c.y - fy, c.x - fx) + game.random.range(-1.2, 1.2);
      f.vx = Math.cos(a) * v.mothSpeed;
      f.vy = Math.sin(a) * v.mothSpeed;
      f.timer = game.random.range(0.4, 0.9);
    } else if (f.kind === "warden" && f.timer <= 0) {
      const d = Math.hypot(c.x - fx, c.y - fy) || 1;
      f.vx = ((c.x - fx) / d) * v.wardenSpeed;
      f.vy = ((c.y - fy) / d) * v.wardenSpeed;
      f.timer = 0.5;
    } else if (f.kind === "thorn" && f.timer <= 0) {
      const d = Math.hypot(c.x - fx, c.y - fy) || 1;
      shots.push({ x: fx, y: fy, vx: ((c.x - fx) / d) * v.shotSpeed, vy: ((c.y - fy) / d) * v.shotSpeed });
      f.timer = v.fireEvery;
      audio.synth({ wave: "square", freq: 180, freqEnd: 420, decay: 0.08, volume: 0.06 });
    }
    f.kx *= Math.exp(-10 * dt);
    f.ky *= Math.exp(-10 * dt);
    const mx = (f.vx + f.kx) * dt;
    const my = (f.vy + f.ky) * dt;
    if (f.kind === "moth") {
      f.x += mx;
      f.y += my;
    } else {
      const hit = map.move(f, mx, my);
      if (hit.hitX) f.vx = -f.vx;
      if (hit.hitY) f.vy = -f.vy;
    }
    // Everyone stays on their own screen.
    f.x = Math.min(Math.max(f.x, r.x + T), r.x + r.w - T - f.w);
    f.y = Math.min(Math.max(f.y, r.y + T), r.y + r.h - T - f.h);
    if (overlaps(player, f)) damagePlayer(f.kind === "warden" ? 2 : 1, fx, fy);
  }

  if (player.swing > 0) {
    const box = swordBox();
    for (const f of foesOnScreen) {
      if (f.hurt > 0 || !overlaps(box, f)) continue;
      f.hp--;
      f.hurt = 0.3;
      const d = Math.hypot(f.x + f.w / 2 - c.x, f.y + f.h / 2 - c.y) || 1;
      const kb = f.kind === "warden" ? v.knockback * 0.5 : v.knockback;
      f.kx = ((f.x + f.w / 2 - c.x) / d) * kb;
      f.ky = ((f.y + f.h / 2 - c.y) / d) * kb;
      game.freeze(0.04);
      sfx.hit();
      if (f.hp <= 0) killFoe(f);
    }
    foesOnScreen = foesOnScreen.filter((f) => f.hp > 0);
  }

  for (const s of shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (overlaps(player, { x: s.x - 3, y: s.y - 3, w: 6, h: 6 })) {
      damagePlayer(1, s.x - s.vx, s.y - s.vy);
      s.vx = s.vy = 0;
    }
  }
  shots = shots.filter(
    (s) => (s.vx || s.vy) && !map.collisionAt(Math.floor(s.x / T), Math.floor(s.y / T)) && overlaps({ x: s.x, y: s.y, w: 1, h: 1 }, r),
  );
}

function updatePickups(): void {
  for (const it of visiblePickups()) {
    if (!overlaps(player, { x: it.x + 3, y: it.y + 3, w: 10, h: 10 })) continue;
    if (it.id >= 0) taken.add(it.id);
    drops = drops.filter((d) => d !== it);
    if (it.kind === "heart") player.hp = Math.min(tuning.values.maxHearts * 2, player.hp + 2);
    if (it.kind === "seed") player.seeds++;
    if (it.kind === "key") player.keys++;
    particles.emit({ x: it.x + 8, y: it.y + 8, count: 10, colors: [C.gold, C.cream], speed: [20, 70], life: [0.2, 0.5] });
    if (it.kind === "relic") {
      state = "won";
      save.set("wins", save.get("wins") + 1);
      if (player.seeds > save.get("bestSeeds")) save.set("bestSeeds", player.seeds);
      game.camera.shake(0.4);
      sfx.win();
    } else sfx.pickup();
  }
}

function visiblePickups(): Pickup[] {
  const here = screenRect();
  const out = [...drops];
  for (const o of objects) {
    const kind = { Key: "key", Seed: "seed", Heart: "heart" }[o.type] as Pickup["kind"] | undefined;
    if (kind && !taken.has(o.id) && overlaps({ x: o.x, y: o.y, w: T, h: T }, here)) out.push({ id: o.id, kind, x: o.x, y: o.y });
  }
  return out;
}

// ---- scene --------------------------------------------------------------------------------------------

const play: Scene = {
  id: "play",

  enter() {
    reset();
  },

  update(dt) {
    titleTime = Math.max(0, titleTime - dt);
    particles.update(dt);

    if (state !== "play") {
      if (input.pressed("attack")) reset();
      return;
    }

    // Screen scroll: everything waits while the camera slides to the next screen.
    if (scroll) {
      scroll.t = Math.min(1, scroll.t + dt / world.values.scrollTime);
      const to = camFor(screen.col, screen.row);
      const e = scroll.t * scroll.t * (3 - 2 * scroll.t);
      cam.x = scroll.fromX + (to.x - scroll.fromX) * e;
      cam.y = scroll.fromY + (to.y - scroll.fromY) * e;
      player.x += scroll.dx * dt;
      player.y += scroll.dy * dt;
      if (scroll.t >= 1) {
        scroll = undefined;
        enterScreen();
      }
      return;
    }
    if (fade) {
      fade.t += dt / world.values.fadeTime;
      if (fade.t >= 1 && !fade.swapped) {
        fade.swapped = true;
        placePlayer(fade.to);
        stairsLock = true;
        player.facing = "down";
        player.y += 6;
      }
      if (fade.t >= 2) fade = undefined;
      return;
    }

    const t = tuning.values;
    player.invuln = Math.max(0, player.invuln - dt);
    player.swing = Math.max(0, player.swing - dt);
    if (input.pressed("attack") && player.swing === 0) {
      player.swing = t.swingTime;
      sfx.swing();
    }

    const ix = input.axis("left", "right");
    const iy = input.axis("up", "down");
    if (player.swing === 0) {
      // Keep facing while moving diagonally if it still matches one of the held directions.
      const vertical = player.facing === "up" || player.facing === "down";
      const keep = vertical ? iy !== 0 && Math.sign(iy) === DIRS[player.facing][1] : ix !== 0 && Math.sign(ix) === DIRS[player.facing][0];
      if (!keep && ix !== 0) player.facing = ix < 0 ? "left" : "right";
      else if (!keep && iy !== 0) player.facing = iy < 0 ? "up" : "down";
    }
    const len = Math.hypot(ix, iy) || 1;
    const moving = player.swing === 0 && (ix !== 0 || iy !== 0);
    const speed = moving ? t.speed : 0;
    player.kx *= Math.exp(-12 * dt);
    player.ky *= Math.exp(-12 * dt);
    const hit = map.move(player, ((ix / len) * speed + player.kx) * dt, ((iy / len) * speed + player.ky) * dt);
    player.walk = moving ? player.walk + dt : 0;
    if (moving && (hit.hitX || hit.hitY)) tryDoor();

    // Walking off the edge of a screen starts a scroll.
    const c = center();
    const next = screenOf(c.x, c.y);
    if (next.col !== screen.col || next.row !== screen.row) {
      const from = camFor(screen.col, screen.row);
      screen.col = next.col;
      screen.row = next.row;
      const dur = world.values.scrollTime;
      scroll = { fromX: from.x, fromY: from.y, t: 0, dx: (Math.sign(ix) * 14) / dur, dy: (Math.sign(iy) * 14) / dur };
      foesOnScreen = [];
      shots = [];
      return;
    }

    // Stairs swap between the overworld and the hollow.
    const onStairs = map.get("ground", Math.floor(c.x / T), Math.floor(c.y / T)) === TILE.stairs;
    if (!onStairs && ix === 0 && iy === 0) stairsLock = false;
    if (onStairs && !stairsLock && (ix !== 0 || iy !== 0)) {
      fade = { t: 0, to: inDungeon() ? returnAt : arriveAt, swapped: false };
      sfx.stairs();
      return;
    }

    updateFoes(dt);
    updatePickups();
  },

  render(draw) {
    draw.withCamera(game.camera, () => {
      map.draw(draw, { camera: game.camera });
      const bob = Math.floor(game.clock.time * 4) % 2;
      for (const it of visiblePickups()) {
        const i = { heart: SPR.heart, seed: SPR.seed, key: SPR.key, relic: SPR.relic }[it.kind];
        draw.sprite(frame(i), it.x + 8, it.y + 8 - bob);
      }
      if (!scroll) {
        for (const f of foesOnScreen) {
          const anim = Math.floor(game.clock.time * (f.kind === "moth" ? 8 : 4)) % 2;
          const i = f.kind === "warden" ? SPR.slime : SPR[f.kind];
          const scale = f.kind === "warden" ? 2 : 1;
          draw.sprite(frame(i + anim), Math.round(f.x + f.w / 2), Math.round(f.y + f.h / 2 - (scale - 1) * 6), {
            scaleX: scale,
            scaleY: scale,
            flash: f.hurt > 0 ? 0.8 : 0,
            tint: f.kind === "warden" ? C.lilac : undefined,
          });
        }
        for (const s of shots) draw.sprite(frame(SPR.shot), Math.round(s.x), Math.round(s.y));
      }

      // Hero, with a blink while invulnerable and the blade drawn as two rects.
      const c = center();
      const blink = player.invuln > 0 && Math.floor(player.invuln * 16) % 2 === 0;
      if (state !== "lost" && !blink) {
        if (player.swing > 0) {
          const b = swordBox();
          draw.rect(b.x, b.y + (b.w > b.h ? 2 : 0), b.w > b.h ? b.w : 2, b.w > b.h ? 2 : b.h, C.cream);
          draw.rect(b.x + (b.w > b.h ? 0 : 2), b.y + (b.w > b.h ? 2 : 0), b.w > b.h ? b.w : 1, b.w > b.h ? 1 : b.h, C.lilac);
        }
        const step = player.swing > 0 ? 2 : Math.floor(player.walk * 8) % 2;
        draw.sprite(frame(SPR.hero + DIR_ROW[player.facing] * 3 + step), Math.round(c.x), Math.round(c.y - 3));
      }
      particles.draw(draw);
    });

    // HUD bar.
    draw.rect(0, 0, game.width, HUD, C.ink);
    draw.rect(0, HUD - 1, game.width, 1, C.plum);
    const maxH = tuning.values.maxHearts;
    for (let i = 0; i < maxH; i++) {
      const left = player.hp - i * 2;
      draw.sprite(frame(left >= 2 ? SPR.hudFull : left === 1 ? SPR.hudHalf : SPR.hudEmpty), 10 + i * 12, 7);
    }
    draw.sprite(frame(SPR.seed), 138, 7);
    draw.text(`${player.seeds}`, 147, 4, { color: C.gold });
    draw.sprite(frame(SPR.key), 172, 7);
    draw.text(`${player.keys}`, 182, 4, { color: C.cream });
    draw.text(inDungeon() ? "hollow" : "fell", 250, 4, { color: C.sage, align: "right" });

    if (fade) draw.rect(0, HUD, game.width, game.height - HUD, `rgba(26,16,32,${Math.min(1, fade.t < 1 ? fade.t : 2 - fade.t)})`);
    const mid = HUD + 88;
    if (titleTime > 0) {
      const a = Math.min(1, titleTime);
      draw.text("mossfell", 128, mid - 30, { font: "16px monospace", color: C.pale, align: "center", alpha: a });
      draw.text("find the mossheart below the fell", 128, mid - 12, { color: C.lilac, align: "center", alpha: a });
    }
    if (state === "won") {
      draw.rect(0, mid - 22, game.width, 40, "rgba(26,16,32,0.8)");
      draw.text("the mossheart is yours", 128, mid - 12, { color: C.pale, align: "center" });
      draw.text(`seeds ${player.seeds}  best ${save.get("bestSeeds")}  ·  attack to play again`, 128, mid + 2, {
        color: C.lilac,
        align: "center",
      });
    }
    if (state === "lost") {
      draw.rect(0, mid - 22, game.width, 40, "rgba(26,16,32,0.8)");
      draw.text("you fell in the fell", 128, mid - 12, { color: C.rose, align: "center" });
      draw.text("attack to try again", 128, mid + 2, { color: C.lilac, align: "center" });
    }
  },

  inspect: () => ({
    state,
    screen: { col: screen.col, row: screen.row },
    scrolling: !!scroll,
    player: {
      x: Math.round(player.x),
      y: Math.round(player.y),
      hp: player.hp,
      keys: player.keys,
      seeds: player.seeds,
      facing: player.facing,
      swinging: player.swing > 0,
    },
    enemies: foesOnScreen.map((f) => ({ kind: f.kind, hp: f.hp, x: Math.round(f.x), y: Math.round(f.y) })),
    kills,
    doorOpen,
    wardenDown,
  }),
};

game.add(play).go("play");
game.start();

// Dev-only: scenario/agent hooks and the overlay (press `). Stripped from production builds.
if (import.meta.env.DEV) {
  // Commands let scenarios and agents jump ahead: { "command": "warp", "args": ["hollow"] }.
  const warp = (to: "hollow" | "fell") => {
    placePlayer(to === "hollow" ? arriveAt : spawnAt);
    titleTime = 0;
  };
  game.use(devTools({ input, commands: { warp } })).use(devOverlay());
}
