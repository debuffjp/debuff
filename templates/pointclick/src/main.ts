import { Assets } from "@debuffjp/assets";
import { Audio } from "@debuffjp/audio";
import { clamp, Game, lerp, type Scene, Sprite, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Tweens } from "@debuffjp/juice";
import { panelAround, Transition } from "@debuffjp/ui";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

const INK = "#11140d";
const PANEL = "#1c2117";
const PANEL_HI = "#2a3320";
const TEXT = "#d3dcc2";
const MUTED = "#6b7560";
const LIME = "#cffb2d";
const AMBER = "#ff9f43";

// Items are frames of assets/items.tt, in this order.
const ITEM = ["key", "cup"] as const;
type Item = (typeof ITEM)[number];

/** Something buff can click. `at` is where buff walks to before `onUse` runs. */
interface Hotspot {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  at: { x: number; y: number };
  /** Walk there and switch rooms instead of running onUse. */
  exit?: string;
  /** An item lying here; picking it up removes the hotspot. */
  item?: Item;
  /** What buff says or does. Return text to say it. */
  onUse?: () => string | undefined;
}

interface Room {
  /** The band of y where buff's feet can be. Lower is nearer the camera. */
  floor: { top: number; bottom: number };
  hotspots: Hotspot[];
  /** Big shapes in the backdrop: x, y, w, h, colour. */
  backdrop: [number, number, number, number, string][];
}

const inventory: Item[] = [];
let won = false;
const has = (item: Item) => inventory.includes(item);

// The world. Add a room or a hotspot here and the rest follows.
const ROOMS: Record<string, Room> = {
  yard: {
    floor: { top: 118, bottom: 166 },
    backdrop: [
      [0, 0, 320, 120, PANEL],
      [40, 30, 90, 90, PANEL_HI],
      [150, 60, 20, 60, MUTED],
    ],
    hotspots: [
      { name: "sign", x: 150, y: 60, w: 20, h: 60, at: { x: 160, y: 126 }, onUse: () => "the sign says: the hall is this way" },
      { name: "key", x: 212, y: 128, w: 12, h: 12, at: { x: 218, y: 142 }, item: "key" },
      { name: "to the hall", x: 296, y: 100, w: 24, h: 70, at: { x: 308, y: 140 }, exit: "hall" },
    ],
  },
  hall: {
    floor: { top: 110, bottom: 166 },
    backdrop: [
      [0, 0, 320, 112, PANEL_HI],
      [20, 20, 280, 90, PANEL],
      [140, 24, 40, 88, MUTED],
    ],
    hotspots: [
      { name: "to the yard", x: 0, y: 100, w: 24, h: 70, at: { x: 12, y: 140 }, exit: "yard" },
      { name: "cup", x: 60, y: 96, w: 12, h: 12, at: { x: 66, y: 118 }, item: "cup" },
      {
        name: "door",
        x: 140,
        y: 24,
        w: 40,
        h: 88,
        at: { x: 160, y: 116 },
        onUse: () => {
          if (won) return "it's open. you did it";
          if (!has("key")) return "locked. there must be a key somewhere";
          won = true;
          save.set("wins", save.get("wins") + 1);
          game.emit("win");
          audio.synth({ freq: 520, freqEnd: 1040, decay: 0.4, volume: 0.15 });
          return "the key fits";
        },
      },
    ],
  },
};

const game = new Game({ canvas, width: 320, height: 180, background: INK, pixelArt: true });
const input = new Input(game, { bindings: { click: ["Pointer"] } });
const audio = new Audio();
const tweens = new Tweens();
const save = new Storage("debuff-pointclick", { wins: 0 });
const fade = new Transition({ duration: 0.3, color: INK });

const tuning = game.params.define("walk", {
  speed: { type: "number", default: 70, min: 10, max: 300, units: "px/s" },
  lineTime: {
    type: "number",
    default: 0.05,
    min: 0,
    max: 0.2,
    units: "s per character",
    description: "How long a line of speech stays up",
  },
});

// ---- load assets ------------------------------------------------------------------------------------

const assets = new Assets(await (await fetch("assets/manifest.json")).json());
await assets.load();
const itemFrames = assets.frames("items");
const buff = new Sprite({
  frames: assets.frames("buff"),
  origin: "bottom-center",
  animations: { idle: { frames: [6], fps: 1 }, walk: { frames: [7, 8], fps: 8, loop: true } },
});
buff.play("idle");

// ---- state --------------------------------------------------------------------------------------------

let roomName = "yard";
const room = () => ROOMS[roomName] as Room;
const player = { x: 60, y: 150, flip: false };
const prev = { x: player.x, y: player.y };
let target: { x: number; y: number; then?: Hotspot } | undefined;
const speech = { text: "", ttl: 0 };

function say(text: string): void {
  speech.text = text;
  speech.ttl = 1 + text.length * tuning.values.lineTime;
}

function use(h: Hotspot): void {
  if (h.exit) {
    const to = h.exit;
    fade.run(() => {
      roomName = to;
      // Come in from the side you left through.
      player.x = h.at.x < 160 ? 300 : 20;
      player.y = clamp(player.y, room().floor.top, room().floor.bottom);
      prev.x = player.x;
      prev.y = player.y;
      game.emit("room", { room: to });
    });
    return;
  }
  if (h.item) {
    inventory.push(h.item);
    room().hotspots.splice(room().hotspots.indexOf(h), 1);
    game.emit("pickup", { item: h.item });
    audio.synth({ freq: 880, freqEnd: 1320, decay: 0.1, volume: 0.12 });
    say(`got the ${h.item}`);
    return;
  }
  const line = h.onUse?.();
  if (line) say(line);
}

function walkTo(x: number, y: number, then?: Hotspot): void {
  const f = room().floor;
  target = { x: clamp(x, 8, game.width - 8), y: clamp(y, f.top, f.bottom), then };
}

const play: Scene = {
  id: "play",

  update(dt) {
    fade.update(dt);
    tweens.update(dt);
    if (fade.blocking) return;
    if (speech.ttl > 0) speech.ttl -= dt;

    if (input.pointer.pressed) {
      const p = input.pointer;
      const hit = room().hotspots.find((h) => p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h);
      if (hit) walkTo(hit.at.x, hit.at.y, hit);
      else walkTo(p.x, p.y);
      speech.ttl = 0;
    }

    prev.x = player.x;
    prev.y = player.y;
    if (target) {
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const far = Math.hypot(dx, dy);
      const step = tuning.values.speed * dt;
      if (far <= step) {
        player.x = target.x;
        player.y = target.y;
        const then = target.then;
        target = undefined;
        if (then) use(then);
      } else {
        player.x += (dx / far) * step;
        player.y += (dy / far) * step;
        if (Math.abs(dx) > 1) player.flip = dx < 0;
      }
    }
    buff.play(target ? "walk" : "idle");
    buff.flipX = player.flip;
    buff.update(dt);
  },

  render(draw, alpha) {
    const r = room();
    for (const [x, y, w, h, colour] of r.backdrop) draw.rect(x, y, w, h, colour);
    draw.rect(0, r.floor.top - 8, game.width, game.height - r.floor.top + 8, PANEL);
    for (const h of r.hotspots) {
      if (h.item) {
        const frame = itemFrames[ITEM.indexOf(h.item)];
        if (frame) draw.sprite(frame, h.x + h.w / 2, h.y + h.h / 2);
      } else if (h.exit) {
        // Exits glow a little at the edge of the screen.
        draw.rect(h.x, h.y, h.w, h.h, "rgba(207,251,45,0.08)");
      }
    }
    if (roomName === "hall") {
      // The door: shut, or an opening with a lit frame once the key has turned.
      if (won) draw.rect(144, 28, 32, 86, LIME);
      draw.rect(146, 30, 28, 82, won ? INK : PANEL_HI);
    }

    // Nearer the camera is lower on screen, and a bit bigger.
    const y = lerp(prev.y, player.y, alpha);
    const depth = (y - r.floor.top) / (r.floor.bottom - r.floor.top);
    buff.x = lerp(prev.x, player.x, alpha);
    buff.y = y;
    buff.scaleX = buff.scaleY = 0.8 + depth * 0.4;
    buff.draw(draw);

    // Inventory, top right.
    inventory.forEach((item, i) => {
      const frame = itemFrames[ITEM.indexOf(item)];
      draw.rect(game.width - 18 - i * 16, 4, 14, 14, INK);
      if (frame) draw.sprite(frame, game.width - 11 - i * 16, 11);
    });

    if (speech.ttl > 0) {
      const width = Math.min(240, draw.measure(speech.text).w + 12);
      const at = panelAround(draw, game.width / 2, 20, width, 12, { borders: [LIME], fill: INK });
      draw.text(speech.text, at.x + width / 2, at.y + 2, { color: TEXT, align: "center" });
    }
    if (won)
      draw.text(`the end · ${save.get("wins")} ${save.get("wins") === 1 ? "win" : "wins"}`, game.width / 2, 150, {
        color: AMBER,
        align: "center",
      });
    fade.draw(draw, 0, 0, game.width, game.height);
  },

  inspect() {
    return {
      room: roomName,
      player: { x: Math.round(player.x), y: Math.round(player.y), walking: target !== undefined },
      inventory: [...inventory],
      hotspots: room().hotspots.map((h) => ({
        name: h.name,
        x: h.x + h.w / 2,
        y: h.y + h.h / 2,
        kind: h.exit ? "exit" : h.item ? "item" : "use",
      })),
      saying: speech.ttl > 0 ? speech.text : "",
      won,
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
        // `give key` puts an item in the inventory, so tests and agents can skip the fetch.
        commands: {
          give: (item: Item) => {
            if (!ITEM.includes(item)) throw new Error(`No such item: ${item}. Items: ${ITEM.join(", ")}`);
            if (!has(item)) inventory.push(item);
          },
        },
      }),
    )
    .use(devOverlay());
}
