import { Assets } from "@debuffjp/assets";
import { Audio } from "@debuffjp/audio";
import { approach, Game, lerp, overlaps, type Scene, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles, squash, Tweens } from "@debuffjp/juice";
import { fromTiled, type MapObject } from "@debuffjp/tilemap";
import { Menu, panelAround, Transition } from "@debuffjp/ui";
import { AMBER, bigText, blob, drawLevel, INK, LIME, MINT, MUTED, PANEL, roundRect, SKY, TEXT } from "./look";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

// Everything is drawn in code (see look.ts), so it stays crisp at any scale.
const game = new Game({ canvas, width: 320, height: 180, background: INK });
const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    jump: ["Space", "ArrowUp", "KeyW", "KeyZ", "PadA", "Pointer"],
    down: ["ArrowDown", "KeyS", "PadDown", "PadStickDown"],
    // ArrowUp also jumps, so menus get their own "up".
    up: ["ArrowUp", "KeyW", "PadUp", "PadStickUp"],
    pause: ["Escape", "KeyP", "PadStart"],
  },
});
const audio = new Audio();
const tweens = new Tweens();
const particles = new Particles(() => game.random.next());
const save = new Storage("debuff-platformer", { best: 0, volume: 10 });
audio.volume("master", save.get("volume") / 10);

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
// The tile ids decide collision and look.ts draws them, so the tileset needs no image.
const map = fromTiled(assets.json("level1"), { image: () => document.createElement("canvas") });
const objects = map.objects("entities");
const spawn = objects.find((o) => o.type === "Spawn") ?? { x: 32, y: 32 };
const goal = objects.find((o) => o.type === "Goal");
game.camera.bounds = { x: 0, y: 0, width: map.pixelWidth, height: map.pixelHeight };
game.camera.deadzone = { x: 24, y: 16 };
game.camera.lerp = 10;

// ---- state --------------------------------------------------------------------------------------------

const player = { x: 0, y: 0, w: 12, h: 13, vx: 0, vy: 0, onGround: false, coyote: 0, buffer: 0, facing: 1, scaleX: 1, scaleY: 1 };
let coins: (MapObject & { taken: boolean; scale: number })[] = [];
let score = 0;
let won = false;
let paused: "pause" | "settings" | false = false;
const fade = new Transition({ duration: 0.25, color: INK });
const menuActions = { up: "up", down: "down", confirm: "jump", back: "pause", left: "left", right: "right" } as const;
const pauseMenu = new Menu(
  [
    { label: "resume", onSelect: () => (paused = false) },
    { label: "settings", onSelect: () => openSettings() },
    { label: "restart", onSelect: () => fade.run(reset) },
  ],
  { actions: menuActions, onBack: () => (paused = false) },
);
const setVolume = (v: number) => {
  save.set("volume", Math.max(0, Math.min(10, v)));
  audio.volume("master", save.get("volume") / 10);
};
const settingsMenu = new Menu(
  [
    {
      label: "volume",
      value: () => `${save.get("volume")}`,
      change: (d) => setVolume(save.get("volume") + d),
      onSelect: () => setVolume(save.get("volume") === 0 ? 10 : 0),
    },
    { label: "back", onSelect: () => (paused = "pause") },
  ],
  { actions: menuActions, onBack: () => (paused = "pause") },
);
function openSettings(): void {
  paused = "settings";
  settingsMenu.focus = 0;
}
// Touch players have no Esc key: a pause button in the HUD. The tap area is bigger than the icon.
const pauseButton = { x: 152, y: 0, w: 16, h: 16 };
const tappedPause = () => input.pointer.pressed && overlaps({ x: input.pointer.x, y: input.pointer.y, w: 1, h: 1 }, pauseButton);

// Where the player was at the previous step: drawing between the two keeps motion smooth on displays faster than 60 Hz.
const prev = { x: 0, y: 0 };
const center = () => ({ x: player.x + player.w / 2, y: player.y + player.h / 2 });
const camTarget = { x: 0, y: 0 };

function reset(): void {
  player.x = spawn.x;
  player.y = spawn.y;
  prev.x = player.x;
  prev.y = player.y;
  player.vx = player.vy = 0;
  coins = objects.filter((o) => o.type === "Coin").map((o) => ({ ...o, taken: false, scale: 1 }));
  score = 0;
  won = false;
  paused = false;
  camTarget.x = center().x;
  camTarget.y = center().y;
  game.camera.follow(camTarget, true);
}

/** Background circles: x, y, radius. */
const BACKDROP = [
  [80, 40, 46],
  [260, 120, 64],
  [470, 30, 38],
  [640, 110, 56],
  [860, 50, 44],
] as const;

// ---- scene --------------------------------------------------------------------------------------------

const play: Scene = {
  id: "play",

  enter() {
    reset();
  },

  update(dt) {
    fade.update(dt);
    if (fade.blocking) return;
    if (paused) {
      (paused === "settings" ? settingsMenu : pauseMenu).update(input);
      return;
    }
    if ((input.pressed("pause") || tappedPause()) && !won) {
      paused = "pause";
      pauseMenu.focus = 0;
      return;
    }
    prev.x = player.x;
    prev.y = player.y;
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
        if (!game.reducedMotion) squash(tweens, player, -0.25);
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
      if (!game.reducedMotion) squash(tweens, player, Math.min(0.35, impact / 1200));
      particles.emit({
        x: center().x,
        y: player.y + player.h,
        count: 6,
        angle: -Math.PI / 2,
        spread: 2.4,
        speed: [20, 60],
        life: [0.2, 0.4],
        colors: [LIME, MINT],
        size: [2, 4],
        shape: "circle",
        gravity: 300,
      });
    }

    // Coins.
    for (const coin of coins) {
      if (coin.taken || !overlaps(player, { x: coin.x, y: coin.y, w: coin.width, h: coin.height })) continue;
      coin.taken = true;
      score++;
      // Tests and agents can wait for this: `events.coin` in scenarios, `game.emitted("coin")` in keiko.
      game.emit("coin", { score });
      // Pop: swell, then shrink to nothing, with a few sparks.
      tweens.to(coin, { scale: 1.6 }, { duration: 0.08, ease: "outQuad" });
      tweens.to(coin, { scale: 0 }, { duration: 0.14, delay: 0.08, ease: "inCubic" });
      particles.emit({
        x: coin.x + 6,
        y: coin.y + 6,
        count: 8,
        colors: [AMBER],
        size: [2, 4],
        shape: "circle",
        speed: [30, 90],
        life: [0.25, 0.5],
      });
      audio.synth({ freq: 880, freqEnd: 1320, decay: 0.1, volume: 0.12 });
    }

    // Goal and pits.
    if (!won && goal && overlaps(player, { x: goal.x, y: goal.y, w: goal.width, h: goal.height })) {
      won = true;
      game.emit("win", { score });
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
    tweens.update(dt);
    particles.update(dt);
  },

  render(draw, alpha) {
    const t = game.clock.time;
    const calm = game.reducedMotion;
    draw.withCamera(game.camera, () => {
      // A few big, very dark circles drift slowly behind the level.
      const drift = (game.camera.x - game.width / 2) * 0.6;
      for (const [x, y, r] of BACKDROP) draw.circle(x + drift, y, r, PANEL);
      drawLevel(draw, map, "ground", {
        x: game.camera.x - game.width / 2 - 16,
        y: game.camera.y - game.height / 2 - 16,
        w: game.width + 32,
        h: game.height + 32,
      });
      for (const coin of coins) {
        if (coin.scale <= 0) continue;
        const bob = calm ? 0 : Math.sin(t * 4 + coin.x) * 1.5;
        draw.circle(coin.x + 6, coin.y + 6 + bob, 4.5 * coin.scale, AMBER);
      }
      if (goal) {
        // A pole with a soft flag that turns amber when you arrive.
        roundRect(draw, goal.x + 7, goal.y, 2, goal.height, 1, MUTED);
        const wave = calm ? 0 : Math.sin(t * 5) * 0.08;
        draw.push();
        draw.translate(goal.x + 9, goal.y + 4);
        draw.scale(1 + wave, 1 - wave);
        roundRect(draw, -1, -4, 11, 8, 4, won ? AMBER : SKY);
        draw.pop();
      }
      const px = lerp(prev.x, player.x, alpha);
      const py = lerp(prev.y, player.y, alpha);
      // Idle breathing (unless a squash is playing), or a happy bounce after winning.
      const breathe = calm || tweens.has(player, "scaleX") ? 0 : won ? Math.abs(Math.sin(t * 8)) * 0.12 : Math.sin(t * 3) * 0.04;
      blob(draw, px + player.w / 2, py + player.h, 14, 13, LIME, {
        scaleX: player.scaleX * (1 + breathe),
        scaleY: player.scaleY * (1 - breathe),
        lean: calm ? 0 : (player.vx / tuning.values.runSpeed) * 0.12,
        look: player.facing,
      });
      particles.draw(draw);
    });
    draw.text(`coins ${score}/${coins.length}`, 6, 5, { color: AMBER });
    draw.text(`best ${save.get("best")}`, 314, 5, { color: TEXT, align: "right" });
    if (!paused && !won) {
      roundRect(draw, 156, 5, 3, 8, 1.5, MUTED);
      roundRect(draw, 161, 5, 3, 8, 1.5, MUTED);
    }
    if (won) {
      panelAround(draw, 160, 84, 150, 36);
      bigText(draw, "you made it!", 160, 70, 2, LIME);
      draw.text("jump to play again", 160, 92, { color: TEXT, align: "center" });
    }
    if (paused) {
      draw.rect(0, 0, game.width, game.height, "rgba(17,20,13,0.6)");
      const menu = paused === "settings" ? settingsMenu : pauseMenu;
      menu.drawPanel(draw, game.width / 2, game.height / 2, { title: paused === "settings" ? "settings" : "paused" });
    }
    fade.draw(draw, 0, 0, game.width, game.height);
  },

  inspect: () => ({
    player: { x: Math.round(player.x), y: Math.round(player.y), onGround: player.onGround },
    score,
    coins: coins.length,
    won,
    paused,
    menu: paused === "settings" ? settingsMenu.inspect().focused : paused ? pauseMenu.inspect().focused : undefined,
    volume: save.get("volume"),
  }),
};

game.add(play).go("play");
game.start();

// Dev-only: scenario/agent hooks and the overlay (press `). Stripped from production builds.
if (import.meta.env.DEV) game.use(devTools({ input })).use(devOverlay());
