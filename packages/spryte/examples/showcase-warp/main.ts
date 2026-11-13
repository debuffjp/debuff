import { createRenderer } from "spryte";

declare global {
  interface Window {
    __frame?: () => void;
  }
}

const W = 960;
const H = 540;
const N = 14000;
const canvas = document.getElementById("c") as HTMLCanvasElement;
canvas.width = W * 2;
canvas.height = H * 2;
const draw = createRenderer(canvas, { smooth: true });
draw.resize(W * 2, H * 2);

// A soft round dot: bright core, feathered edge.
const dot = document.createElement("canvas");
dot.width = dot.height = 32;
{
  const g = dot.getContext("2d") as CanvasRenderingContext2D;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "#fff");
  gr.addColorStop(0.4, "#ffffffdd");
  gr.addColorStop(1, "#fff0");
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
}

// A faint blue glow at the vanishing point, and a vignette. Both are one rect with a smooth falloff.
const core = draw.createShader(`
  vec4 effect(vec4 color, highp vec2 uv) {
    float d = distance(frameUv(), vec2(0.5, 0.5));
    float k = pow(1.0 - smoothstep(0.0, 0.5, d), 2.2) * 0.1;
    return vec4(0.32, 0.5, 1.0, 1.0) * k;
  }`);
const backing = draw.createShader(`
  vec4 effect(vec4 color, highp vec2 uv) {
    vec2 p = (frameUv() - vec2(0.5, 0.5)) * vec2(2.0, 2.0);
    return vec4(0.0, 0.0, 0.0, 1.0) * (1.0 - smoothstep(0.35, 1.0, length(p))) * 0.75;
  }`);
const vignette = draw.createShader(`
  vec4 effect(vec4 color, highp vec2 uv) {
    float d = distance(frameUv(), vec2(0.5, 0.5));
    return vec4(0.0, 0.0, 0.0, smoothstep(0.45, 0.95, d) * 0.7);
  }`);

let seed = 20261107;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

const FAR = 1;
const NEAR = 0.03;
const SPEED = 0.3;
const K = 150; // projection scale
const sx = new Float32Array(N);
const sy = new Float32Array(N);
const sz = new Float32Array(N);
const tint = new Uint8Array(N);
const xy = new Float32Array(N * 2);
const scale = new Float32Array(N);
const color = new Uint32Array(N);
const PALETTE = [
  [205, 220, 255],
  [255, 238, 214],
  [165, 205, 255],
  [255, 196, 228],
  [190, 255, 240],
];

function spawn(i: number, z: number) {
  const a = rnd() * Math.PI * 2;
  const r = 0.2 + rnd() ** 1.2 * 1.7;
  sx[i] = Math.cos(a) * r;
  sy[i] = Math.sin(a) * r * 0.62;
  sz[i] = z;
  const t = rnd();
  tint[i] = t < 0.55 ? 0 : t < 0.7 ? 1 : t < 0.85 ? 2 : t < 0.95 ? 3 : 4;
}
for (let i = 0; i < N; i++) spawn(i, NEAR + rnd() * (FAR - NEAR));

function step(dt: number) {
  for (let i = 0; i < N; i++) {
    sz[i] -= SPEED * dt * (0.6 + 0.8 * (1 - sz[i]));
    if (sz[i] <= NEAR) spawn(i, FAR);
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

function drawFrame() {
  draw.begin("#03050d", W, H, 2);
  const cx = W / 2;
  const cy = H / 2;
  draw.blend("add");
  draw.withShader(core, () => draw.rect(0, 0, W, H, "#fff"));
  for (let i = 0; i < N; i++) {
    const z = sz[i];
    const px = cx + (sx[i] / z) * K;
    const py = cy + (sy[i] / z) * K;
    xy[i * 2] = px;
    xy[i * 2 + 1] = py;
    const near = 1 - (z - NEAR) / (FAR - NEAR);
    const fade = smooth(0, 0.12, near) * (1 - smooth(0.93, 1, near));
    const lum = (0.05 + near * near * 0.95) * fade;
    const c = PALETTE[tint[i]];
    const r = Math.round(c[0] * lum);
    const g = Math.round(c[1] * lum);
    const b = Math.round(c[2] * lum);
    scale[i] = 0.05 + near ** 3 * 0.55;
    color[i] = ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
    if (near > 0.85 && px > -30 && px < W + 30 && py > -30 && py < H + 30) {
      const z2 = z + SPEED * (1 / 60) * (2 + near * 6);
      const qx = cx + (sx[i] / z2) * K;
      const qy = cy + (sy[i] / z2) * K;
      draw.line(qx, qy, px, py, 0.5 + near * near * 1.6, ((r << 24) | (g << 16) | (b << 8) | Math.round(120 * fade)) >>> 0);
    }
  }
  draw.sprites(dot, xy, N, {}, { scale, color });
  draw.blend("normal");
  draw.withShader(vignette, () => draw.rect(0, 0, W, H, "#fff"));
  draw.withShader(backing, () => draw.rect(W / 2 - 230, 8, 460, 112, "#fff"));
  draw.text("W A R P", W / 2 + 2, 64, { font: "bold 54px sans-serif", color: "#000000", align: "center", baseline: "middle", alpha: 0.6 });
  draw.text("W A R P", W / 2, 62, { font: "bold 54px sans-serif", color: "#eaf2ff", align: "center", baseline: "middle" });
  draw.end();
}

drawFrame();
window.__frame = () => {
  step(1 / 60);
  drawFrame();
};
