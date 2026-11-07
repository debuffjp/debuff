import { createRenderer } from "spryte";

declare global {
  interface Window {
    __frame?: () => void;
  }
}

const W = 960;
const H = 540;
const canvas = document.getElementById("c") as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;
const draw = createRenderer(canvas, { smooth: true });
draw.resize(W, H);
const target = draw.createTarget(W, H);

// Water surface: gentle two-direction wobble plus a soft vignette, in one pass over the target.
const water = draw.createShader(`
  uniform float time;
  vec4 effect(vec4 color, vec2 uv) {
    vec2 p = uv;
    p.x += sin(uv.y * 22.0 + time * 1.3) * 0.0035 + sin(uv.y * 7.0 - time * 0.8) * 0.0025;
    p.y += sin(uv.x * 18.0 + time * 1.1) * 0.0035 + sin(uv.x * 5.0 + time * 0.7) * 0.0025;
    p = clamp(p, 0.001, 0.999);
    vec4 c = source(p) * color;
    float d = distance(uv, vec2(0.5, 0.5));
    float v = 1.0 - smoothstep(0.35, 0.85, d) * 0.55;
    return c * v;
  }`);

// A smooth radial glow, drawn as one rect: frameUv() runs 0..1 over the rect, so the falloff has no steps.
const glow = draw.createShader(`
  vec4 effect(vec4 color, vec2 uv) {
    float d = distance(frameUv(), vec2(0.72, 0.3));
    float k = pow(1.0 - smoothstep(0.0, 0.5, d), 2.0) * 0.16;
    return vec4(1.0, 0.84, 0.63, 1.0) * k;
  }`);

function mulberry32(a: number) {
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(7);

interface Ripple {
  x: number;
  y: number;
  age: number;
  life: number;
  maxR: number;
}
const ripples: Ripple[] = [];
let frame = 0;
let nextDrop = 0;

function step() {
  frame++;
  nextDrop--;
  if (nextDrop <= 0) {
    ripples.push({ x: 50 + rnd() * (W - 100), y: 50 + rnd() * (H - 100), age: 0, life: 150 + rnd() * 70, maxR: 80 + rnd() * 90 });
    nextDrop = 4 + Math.floor(rnd() * 10);
  }
  for (const r of ripples) r.age++;
  for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].age > ripples[i].life) ripples.splice(i, 1);
}

// A ring as short line segments. Ripples are seen at an angle, so the ring is squashed vertically.
const SQUASH = 0.62;
function ring(x: number, y: number, r: number, w: number, c: string) {
  const n = Math.max(28, Math.min(120, Math.round(r * 0.9)));
  let px = x + r;
  let py = y;
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const nx = x + Math.cos(a) * r;
    const ny = y + Math.sin(a) * r * SQUASH;
    draw.line(px, py, nx, ny, w, c);
    px = nx;
    py = ny;
  }
}

function scene() {
  // Water: deep teal at the top to a lighter, warmer teal near the viewer, in thin bands.
  const bands = 72;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const r = Math.round(10 + 22 * t);
    const g = Math.round(46 + 44 * t);
    const b = Math.round(62 + 38 * t);
    draw.rect(0, (i * H) / bands, W, H / bands + 1, `rgb(${r},${g},${b})`);
  }
  // A soft light patch on the water, as if from a low sun off to the right.
  draw.blend("add");
  draw.withShader(glow, () => draw.rect(0, 0, W, H, "#fff"));
  // Ripples: a bright crest, a dark trough just inside it, then fainter inner rings.
  for (const rp of ripples) {
    const t = rp.age / rp.life;
    const ease = 1 - (1 - t) * (1 - t) * (1 - t);
    const a = (1 - t) * (1 - t);
    const r1 = rp.maxR * ease;
    if (rp.age < 8) draw.circle(rp.x, rp.y, 2 + rp.age * 0.6, `rgba(230,250,250,${0.9 * (1 - rp.age / 8)})`);
    ring(rp.x, rp.y, r1, 2.4, `rgba(190,238,236,${0.55 * a})`);
    ring(rp.x, rp.y, r1 * 0.86, 4, `rgba(60,150,160,${0.12 * a})`);
    if (t > 0.1) ring(rp.x, rp.y, r1 * 0.66, 1.6, `rgba(170,224,226,${0.32 * a})`);
    if (t > 0.22) ring(rp.x, rp.y, r1 * 0.44, 1.2, `rgba(150,208,214,${0.22 * a})`);
  }
  draw.blend("normal");
}

function drawFrame() {
  draw.begin("#000", W, H, 1);
  draw.into(target, scene);
  water.set("time", frame / 60);
  draw.withShader(water, () => draw.sprite(target, 0, 0, { origin: [0, 0] }));
  draw.end();
}

for (let i = 0; i < 140; i++) step();
frame = 0;
window.__frame = () => {
  step();
  drawFrame();
};
drawFrame();
