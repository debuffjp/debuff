import { Audio } from "@debuffjp/audio";
import { type Draw, Game, type Scene, Storage } from "@debuffjp/core";
import { devOverlay, devTools } from "@debuffjp/dev";
import { Input } from "@debuffjp/input";
import { Particles, Tweens } from "@debuffjp/juice";
import { adjacent, type Board, collapse, EMPTY, fill, findMatches, findMove, fromRows, swap, swapMatches, toRows } from "./board";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error('Missing <canvas id="game">');

// Portrait, phone-first. Everything is drawn in code, so it's crisp at any size.
const game = new Game({ canvas, width: 360, height: 640, background: "#11140d" });
const input = new Input(game, {
  bindings: {
    left: ["ArrowLeft", "KeyA", "PadLeft", "PadStickLeft"],
    right: ["ArrowRight", "KeyD", "PadRight", "PadStickRight"],
    up: ["ArrowUp", "KeyW", "PadUp", "PadStickUp"],
    down: ["ArrowDown", "KeyS", "PadDown", "PadStickDown"],
    pick: ["Space", "Enter", "KeyZ", "PadA"],
  },
});
const audio = new Audio();
const tweens = new Tweens();
const particles = new Particles(() => game.random.next());
const save = new Storage("debuff-squish", { best: 0 });

// Creative parameters: typed, ranged and live-tunable in the dev panel (press `).
const feel = game.params.define("feel", {
  swap: { type: "number", default: 0.14, min: 0.03, max: 0.6, units: "s", description: "Time to swap two pieces" },
  pop: { type: "number", default: 0.22, min: 0.05, max: 0.8, units: "s", description: "Time matched pieces take to pop" },
  fall: { type: "number", default: 0.07, min: 0.02, max: 0.3, units: "s/cell", description: "Fall time per cell" },
  wobble: { type: "number", default: 0.05, min: 0, max: 0.2, description: "How much idle pieces jiggle" },
});
const rules = game.params.define("rules", {
  moves: { type: "number", default: 25, min: 1, max: 99, description: "Swaps per round" },
});

// One flat colour per piece, each with its own shape too, so colours never have to be told apart by hue alone.
const INK = "#11140d";
const PIECES = [
  { colour: "#38bdf8", shape: "circle" },
  { colour: "#f472b6", shape: "square" },
  { colour: "#fbbf24", shape: "diamond" },
  { colour: "#a78bfa", shape: "pill" },
  { colour: "#cffb2d", shape: "plus" },
  { colour: "#34d399", shape: "drop" },
] as const;

const W = 8;
const H = 8;
const CELL = 42;
const BOARD_X = (game.width - W * CELL) / 2;
const BOARD_Y = 150;

interface Piece {
  colour: number;
  /** Position in cells (fractional while moving). */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Desyncs each piece's idle jiggle. */
  phase: number;
  /** Mid-animation (popping in, popping out): the idle jiggle leaves its scale alone. */
  busy: boolean;
}

type Phase = "idle" | "swap" | "unswap" | "pop" | "fall" | "over";

let board: Board = { w: W, h: H, cells: [] };
let pieces: (Piece | undefined)[] = [];
let phase: Phase = "idle";
let timer = 0;
let swapping: [number, number] = [0, 0];
let popping = new Set<number>();
let score = 0;
let moves = 0;
let combo = 0;
let selected = -1;
let cursor = 27;
let pressAt: { x: number; y: number; cell: number } | undefined;
const popups: { text: string; x: number; y: number; t: number }[] = [];

/**
 * Squash a piece and let it spring back. Only scale is tweened, so a move already under way keeps going
 * (juice's `squash()` kills every tween on its target, which would stop the piece mid-swap).
 */
function jelly(p: Piece, amount: number, duration: number) {
  p.scaleX = 1 + amount;
  p.scaleY = 1 - amount;
  tweens.to(p, { scaleX: 1, scaleY: 1 }, { duration, ease: "outElastic" });
}

const piece = (colour: number, x: number, y: number): Piece => ({
  colour,
  x,
  y,
  scaleX: 1,
  scaleY: 1,
  phase: game.random.next() * 6.28,
  busy: false,
});
const cellAt = (px: number, py: number) => {
  const x = Math.floor((px - BOARD_X) / CELL),
    y = Math.floor((py - BOARD_Y) / CELL);
  return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1;
};

function setBoard(b: Board) {
  board = b;
  pieces = b.cells.map((c, i) => (c === EMPTY ? undefined : piece(c, i % W, Math.floor(i / W))));
}

function newRound() {
  setBoard(fill(W, H, PIECES.length, () => game.random.next()));
  score = 0;
  moves = rules.values.moves;
  combo = 0;
  selected = -1;
  phase = "idle";
  // Pop every piece into place in a ripple from the top-left: grow from nothing with a springy overshoot.
  // (Dropping the board in from above made each column stream through the cells above it, a strobe the
  // scenarios' flash check caught.)
  for (const p of pieces) {
    if (!p) continue;
    p.scaleX = 0;
    p.scaleY = 0;
    p.busy = true;
    tweens.to(
      p,
      { scaleX: 1, scaleY: 1 },
      { duration: 0.35, delay: (p.x + p.y) * 0.035, ease: "outBack", onComplete: () => (p.busy = false) },
    );
  }
}

// ---- turns ------------------------------------------------------------------------------------------

function trySwap(a: number, b: number) {
  if (phase !== "idle" || !adjacent(board, a, b)) return;
  selected = -1;
  swapping = [a, b];
  phase = "swap";
  timer = feel.values.swap;
  const pa = pieces[a]!,
    pb = pieces[b]!;
  tweens.to(pa, { x: pb.x, y: pb.y }, { duration: feel.values.swap, ease: "inOutQuad" });
  tweens.to(pb, { x: pa.x, y: pa.y }, { duration: feel.values.swap, ease: "inOutQuad" });
  jelly(pa, 0.25, 0.3);
  jelly(pb, 0.25, 0.3);
  audio.synth({ freq: 380, freqEnd: 520, decay: 0.06 });
}

function finishSwap() {
  const [a, b] = swapping;
  const ok = swapMatches(board, a, b);
  swap(board, a, b);
  [pieces[a], pieces[b]] = [pieces[b], pieces[a]];
  if (!ok) {
    // No match: wobble back where they came from. The move isn't spent.
    swap(board, a, b);
    [pieces[a], pieces[b]] = [pieces[b], pieces[a]];
    phase = "unswap";
    timer = feel.values.swap * 1.6;
    for (const i of [a, b]) {
      const p = pieces[i]!;
      tweens.to(p, { x: i % W, y: Math.floor(i / W) }, { duration: feel.values.swap * 1.6, ease: "outBack" });
      jelly(p, -0.2, 0.35);
    }
    audio.synth({ freq: 220, freqEnd: 160, decay: 0.12 });
    game.emit("nomatch");
    return;
  }
  moves--;
  combo = 0;
  game.emit("swap");
  startPop();
}

function startPop() {
  popping = findMatches(board);
  combo++;
  phase = "pop";
  timer = feel.values.pop;
  const gained = popping.size * 10 * combo;
  score += gained;
  let sx = 0,
    sy = 0;
  for (const i of popping) {
    const p = pieces[i]!;
    p.busy = true;
    sx += p.x;
    sy += p.y;
    // Swell, then shrink to nothing.
    tweens.to(p, { scaleX: 1.35, scaleY: 1.35 }, { duration: feel.values.pop * 0.35, ease: "outQuad" });
    tweens.to(p, { scaleX: 0, scaleY: 0 }, { duration: feel.values.pop * 0.65, delay: feel.values.pop * 0.35, ease: "inCubic" });
  }
  const cx = BOARD_X + (sx / popping.size + 0.5) * CELL,
    cy = BOARD_Y + (sy / popping.size + 0.5) * CELL;
  popups.push({ text: combo > 1 ? `+${gained}  x${combo}!` : `+${gained}`, x: cx, y: cy, t: 0 });
  if (popping.size >= 5 || combo >= 3) game.camera.shake(0.25);
  // Each step of a cascade pops a little higher.
  audio.synth({ freq: 520 * 1.12 ** (combo - 1), freqEnd: 900 * 1.12 ** (combo - 1), decay: 0.14 });
  game.emit("pop", { count: popping.size, combo });
}

function finishPop() {
  for (const i of popping) {
    const p = pieces[i]!;
    particles.emit({
      x: BOARD_X + (p.x + 0.5) * CELL,
      y: BOARD_Y + (p.y + 0.5) * CELL,
      count: 8,
      colors: [PIECES[p.colour]!.colour],
      speed: [60, 200],
      size: [4, 8],
      shape: "circle",
      gravity: 400,
    });
    board.cells[i] = EMPTY;
    pieces[i] = undefined;
  }
  const falls = collapse(board, () => Math.floor(game.random.next() * PIECES.length));
  const moved: (Piece | undefined)[] = [...pieces];
  let longest = 0;
  for (const f of falls) {
    const p = f.colour === undefined ? pieces[f.fromY * W + f.fromX]! : piece(f.colour, f.fromX, f.fromY);
    if (f.colour === undefined) moved[f.fromY * W + f.fromX] = undefined;
    moved[f.to] = p;
    const toY = Math.floor(f.to / W),
      duration = Math.sqrt(toY - f.fromY) * feel.values.fall * 2.2;
    longest = Math.max(longest, duration);
    tweens.to(p, { y: toY }, { duration, ease: "inQuad", onComplete: () => jelly(p, 0.22, 0.3) });
  }
  pieces = moved;
  phase = "fall";
  timer = longest + 0.05;
}

function finishFall() {
  if (findMatches(board).size) return startPop();
  if (combo > 1) game.emit("cascade", { combo });
  if (moves <= 0) {
    phase = "over";
    if (score > save.get("best")) save.set("best", score);
    game.emit("over", { score });
    return;
  }
  if (!findMove(board)) {
    // Stuck: reshuffle into a fresh board with a move, dropped in like at the start.
    const keep = { score, moves };
    newRound();
    score = keep.score;
    moves = keep.moves;
    game.emit("shuffle");
  }
  phase = "idle";
}

// ---- input ------------------------------------------------------------------------------------------

function handleInput() {
  const ptr = input.pointer;
  if (ptr.pressed) {
    const cell = cellAt(ptr.x, ptr.y);
    pressAt = cell >= 0 ? { x: ptr.x, y: ptr.y, cell } : undefined;
    if (cell >= 0) {
      cursor = cell;
      if (selected >= 0 && adjacent(board, selected, cell)) trySwap(selected, cell);
      else selected = cell;
    }
  }
  // Swipe: drag a piece more than a third of a cell towards a neighbour.
  if (ptr.down && pressAt && phase === "idle") {
    const dx = ptr.x - pressAt.x,
      dy = ptr.y - pressAt.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > CELL / 3) {
      const from = pressAt.cell,
        x = from % W,
        y = Math.floor(from / W);
      const to =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? x < W - 1
              ? from + 1
              : -1
            : x > 0
              ? from - 1
              : -1
          : dy > 0
            ? y < H - 1
              ? from + W
              : -1
            : y > 0
              ? from - W
              : -1;
      pressAt = undefined;
      if (to >= 0) trySwap(from, to);
    }
  }
  if (ptr.released) pressAt = undefined;

  // Keyboard and gamepad: move the cursor, pick a piece up, then push it in a direction.
  for (const [action, dx, dy] of [
    ["left", -1, 0],
    ["right", 1, 0],
    ["up", 0, -1],
    ["down", 0, 1],
  ] as const) {
    if (!input.pressed(action)) continue;
    const x = (cursor % W) + dx,
      y = Math.floor(cursor / W) + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (selected >= 0) trySwap(selected, y * W + x);
    else cursor = y * W + x;
  }
  if (input.pressed("pick")) selected = selected === cursor ? -1 : cursor;
}

// ---- drawing ----------------------------------------------------------------------------------------

function roundRect(draw: Draw, x: number, y: number, w: number, h: number, r: number, colour: string) {
  draw.rect(x + r, y, w - 2 * r, h, colour);
  draw.rect(x, y + r, w, h - 2 * r, colour);
  draw.circle(x + r, y + r, r, colour);
  draw.circle(x + w - r, y + r, r, colour);
  draw.circle(x + r, y + h - r, r, colour);
  draw.circle(x + w - r, y + h - r, r, colour);
}

function drawPiece(draw: Draw, p: Piece, cx: number, cy: number, highlight: boolean) {
  const { colour, shape } = PIECES[p.colour]!;
  const r = CELL * 0.38;
  draw.push();
  // Squash and stretch from the bottom of the cell, so pieces look like they sit on something.
  draw.translate(cx, cy + r);
  draw.scale(p.scaleX, p.scaleY);
  draw.translate(0, -r);
  if (highlight) draw.circle(0, 0, r * 1.25, "#ffffff22");
  switch (shape) {
    case "circle":
      draw.circle(0, 0, r, colour);
      break;
    case "square":
      roundRect(draw, -r * 0.92, -r * 0.92, r * 1.84, r * 1.84, r * 0.45, colour);
      break;
    case "diamond":
      draw.push();
      draw.rotate(Math.PI / 4);
      roundRect(draw, -r * 0.78, -r * 0.78, r * 1.56, r * 1.56, r * 0.35, colour);
      draw.pop();
      break;
    case "pill":
      roundRect(draw, -r, -r * 0.7, r * 2, r * 1.4, r * 0.7, colour);
      break;
    case "plus":
      roundRect(draw, -r, -r * 0.4, r * 2, r * 0.8, r * 0.4, colour);
      roundRect(draw, -r * 0.4, -r, r * 0.8, r * 2, r * 0.4, colour);
      roundRect(draw, -r * 0.62, -r * 0.62, r * 1.24, r * 1.24, r * 0.3, colour);
      break;
    case "drop":
      draw.push();
      draw.rotate(Math.PI / 4);
      roundRect(draw, -r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.85, colour);
      draw.rect(-r * 0.85, -r * 0.85, r * 0.85, r * 0.85, colour);
      draw.pop();
      break;
  }
  // Two dot eyes, like buff.
  draw.circle(-r * 0.3, -r * 0.05, r * 0.13, INK);
  draw.circle(r * 0.3, -r * 0.05, r * 0.13, INK);
  draw.pop();
}

function bigText(draw: Draw, text: string, x: number, y: number, size: number, colour: string) {
  draw.push();
  draw.translate(x, y);
  draw.scale(size);
  draw.text(text, 0, 0, { color: colour, align: "center" });
  draw.pop();
}

// ---- the scene --------------------------------------------------------------------------------------

const play: Scene = {
  id: "play",
  enter: newRound,

  update(dt) {
    timer -= dt;
    if (phase === "idle") handleInput();
    else if (phase === "over") {
      if (input.pressed("pick") || input.pointer.pressed) newRound();
    } else if (timer <= 0) {
      if (phase === "swap") finishSwap();
      else if (phase === "unswap") phase = "idle";
      else if (phase === "pop") finishPop();
      else if (phase === "fall") finishFall();
    }
    // Idle jiggle: every piece breathes a little, out of step with its neighbours. Tweens run after this, so a
    // piece that's squashing or popping shows its tween instead.
    const wob = game.reducedMotion ? 0 : feel.values.wobble;
    const t = game.clock.time;
    for (const p of pieces) {
      if (!p || p.busy) continue;
      const s = Math.sin(t * 3 + p.phase) * wob;
      p.scaleX = 1 + s;
      p.scaleY = 1 - s;
    }
    for (const pop of popups) pop.t += dt;
    while (popups[0] && popups[0].t > 1) popups.shift();
    tweens.update(dt);
    particles.update(dt);
  },

  render(draw) {
    draw.withCamera(game.camera, () => {
      // HUD
      bigText(draw, String(score), game.width / 2, 40, 5, "#cffb2d");
      bigText(draw, `${moves} moves left   best ${Math.max(save.get("best"), score)}`, game.width / 2, 100, 2, "#d3dcc2");

      // The board: a soft panel with a quiet checkerboard.
      roundRect(draw, BOARD_X - 8, BOARD_Y - 8, W * CELL + 16, H * CELL + 16, 14, "#1b2014");
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) if ((x + y) % 2) draw.rect(BOARD_X + x * CELL, BOARD_Y + y * CELL, CELL, CELL, "#20261a");
      const hover = phase === "idle" ? cursor : -1;
      for (const [i, p] of pieces.entries()) {
        if (!p) continue;
        const cx = BOARD_X + (p.x + 0.5) * CELL,
          cy = BOARD_Y + (p.y + 0.5) * CELL;
        if (p.y < -0.5) continue; // still above the board
        drawPiece(draw, p, cx, cy, i === selected || i === hover);
      }
      particles.draw(draw);

      for (const pop of popups) bigText(draw, pop.text, pop.x, pop.y - pop.t * 40 - 10, 2, pop.t < 0.7 ? "#ffffff" : "#ffffff88");

      if (phase === "over") {
        roundRect(draw, 40, 250, game.width - 80, 150, 18, "#11140d");
        bigText(draw, "squished!", game.width / 2, 272, 4, "#cffb2d");
        bigText(draw, `${score} points`, game.width / 2, 322, 2, "#ffffff");
        bigText(draw, "tap to play again", game.width / 2, 352, 2, "#d3dcc2");
      }
    });
  },

  inspect() {
    // Pieces drawn away from the cell the rules say they're in: always 0 when the game is idle.
    const adrift = pieces.filter((p, i) => p && (Math.abs(p.x - (i % W)) > 0.01 || Math.abs(p.y - Math.floor(i / W)) > 0.01)).length;
    return { phase, score, moves, combo, selected, cursor, best: save.get("best"), board: toRows(board), adrift };
  },
};

game.add(play).go("play");
game.start();

// Dev-only: window.__DEBUFF_DEV__ for scenarios and agents, and the dev panel (press `). Commands let tests and
// agents set up exact boards: { "command": "board", "args": [["abcab…", …]] }.
if (import.meta.env.DEV) {
  const commands = {
    board: (rows: string[]) => {
      setBoard(fromRows(rows));
      phase = "idle";
    },
    moves: (n: number) => {
      moves = Number(n);
    },
  };
  game.use(devTools({ input, commands })).use(devOverlay());
}
