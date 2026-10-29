// Particles drifting through a flow field, leaving glowing trails. The trails live in a render
// target that is faded a little and drawn over again every frame; the particles are added on top
// with additive blending in one sprites() call; a grain shader finishes the frame on WebGL2.
// In 3D the particles run along the contour lines of a rolling terrain, projected with perspective
// each frame: elevation sets each copy's colour, depth its size and brightness. Additive blending
// ignores draw order, so nothing needs sorting by depth.
import { createRenderer, type Draw, type RenderTarget, type Shader } from "spryte";
import * as river from "./river.ts";
import * as waves from "./waves.ts";

const BG = "#11140d";
const FADE = "#11140d26"; // how much of the old frame each new frame covers: lower is longer trails
const FADE_3D = "#11140d30"; // shorter trails in 3D, where the camera moves
// The colours of debuff.jp's spryte page.
const PALETTE = [0xcffb2d, 0x38bdf8, 0xf472b6, 0xfbbf24, 0xa78bfa];
const MAX = 150_000;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const positions = new Float32Array(MAX * 2); // target pixels
const colors = new Uint32Array(MAX);
const life = new Float32Array(MAX); // seconds left before a particle respawns somewhere random
let n = 60_000;
type Mode = "2d" | "3d" | "waves" | "river";
const startMode = new URLSearchParams(location.search).get("mode");
let mode: Mode = startMode === "3d" || startMode === "waves" || startMode === "river" ? startMode : "2d";

// 3D state: positions on a terrain, u and v in [0, 1), projected to screen pixels every frame.
const TAU = Math.PI * 2;
const world = new Float32Array(MAX * 2);
const projected = new Float32Array(MAX * 2);
const scales = new Float32Array(MAX);
const colors3d = new Uint32Array(MAX);
const camera = { yaw: 0.6, pitch: 0.75, spin: 0.08 };
// Elevation colours, low to high: violet, sky, lime, amber (the spryte page's palette).
const RAMP = new Uint32Array(64);
{
  const stops = [0xa78bfa, 0x38bdf8, 0xcffb2d, 0xfbbf24];
  for (let i = 0; i < 64; i++) {
    const f = (i / 63) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(f));
    const u = f - k;
    const a = stops[k];
    const b = stops[k + 1];
    let c = 0;
    for (const sh of [16, 8, 0]) c |= Math.round(((a >> sh) & 255) * (1 - u) + ((b >> sh) & 255) * u) << sh;
    RAMP[i] = c;
  }
}
function spawn3d(i: number): void {
  world[i * 2] = Math.random();
  world[i * 2 + 1] = Math.random();
  life[i] = 3 + Math.random() * 6;
}
let seed = Math.random() * 1000;

const params = new URLSearchParams(location.search);
let backend: "auto" | "2d" = params.get("backend") === "2d" ? "2d" : "auto";
const stage = document.getElementById("stage") as HTMLDivElement;
const stats = document.getElementById("stats") as HTMLDivElement;
const caption = document.getElementById("caption") as HTMLDivElement;
const CAPTIONS: Record<Mode, string> = {
  river:
    "A river of particles runs down a meandering channel, speeds up toward the lip, falls, bursts into the pool and throws mist. Colour shows speed. Drag to turn the camera.",
  waves:
    "An ocean of particles: four Gerstner waves sharpen into crests that throw spray, colour shows height. Click the water to skip a pebble; each touch drives a ripple simulation. Drag to turn the camera.",
  "2d": "Drag to stir the field. Click to drop a colour. Each particle is one copy in a single sprites() call, its trail a render target that fades a little every frame.",
  "3d": "The same particles on a rolling terrain, running along its contour lines, so they trace a glowing topographic map. Colour shows elevation. Drag to turn the camera.",
};
let canvas = document.createElement("canvas");
let draw: Draw;
let trails: RenderTarget | null = null;
let grain: Shader | null = null;

function makeRenderer(): void {
  // A canvas keeps the first context type it gets, so switching renderer means a new canvas.
  const next = document.createElement("canvas");
  canvas.replaceWith(next);
  if (!next.isConnected) stage.append(next);
  canvas = next;
  draw = createRenderer(canvas, { backend });
  trails = null;
  grain =
    draw.kind === "webgl2"
      ? draw.createShader(`
          uniform float seed;
          vec4 effect(vec4 color, vec2 uv) {
            vec4 c = source(uv) * color;
            float n = fract(sin(dot(uv * 913.0 + seed, vec2(12.9898, 78.233))) * 43758.5453);
            c.rgb += (n - 0.5) * 0.06 * c.a;
            return c;
          }
        `)
      : null;
}
makeRenderer();

// A 5x5 soft dot made at runtime, so the example has no assets.
const dot = new OffscreenCanvas(5, 5);
{
  const g = dot.getContext("2d") as OffscreenCanvasRenderingContext2D;
  const grad = g.createRadialGradient(2.5, 2.5, 0, 2.5, 2.5, 2.5);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(1, "#fff0");
  g.fillStyle = grad;
  g.fillRect(0, 0, 5, 5);
}

function spawn(i: number, w: number, h: number): void {
  positions[i * 2] = Math.random() * w;
  positions[i * 2 + 1] = Math.random() * h;
  life[i] = 2 + Math.random() * 6;
}
function paint(i: number, c: number, alpha = 0x1c): void {
  colors[i] = ((c << 8) | alpha) >>> 0;
}

// Stirring: each drag sample leaves a small vortex that fades out.
const swirls: { x: number; y: number; dx: number; dy: number; age: number }[] = [];
let down: { x: number; y: number; moved: boolean } | null = null;
let colourIndex = 1;
function local(e: PointerEvent): [number, number] {
  const r = stage.getBoundingClientRect();
  const dpr = canvas.width / Math.max(1, r.width);
  return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
}
stage.addEventListener("pointerdown", (e) => {
  stage.setPointerCapture(e.pointerId);
  const [x, y] = local(e);
  down = { x, y, moved: false };
});
stage.addEventListener("pointermove", (e) => {
  if (!down) return;
  const [x, y] = local(e);
  const dx = x - down.x;
  const dy = y - down.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) down.moved = true;
  if (mode !== "2d") {
    // In 3D, dragging turns the camera instead of stirring.
    camera.yaw += dx * 0.004;
    camera.pitch = Math.max(-1.2, Math.min(1.2, camera.pitch + dy * 0.004));
    down.x = x;
    down.y = y;
    return;
  }
  swirls.push({ x, y, dx, dy, age: 0 });
  if (swirls.length > 40) swirls.shift();
  down.x = x;
  down.y = y;
});
stage.addEventListener("pointerup", (e) => {
  if (down && !down.moved && mode === "waves") {
    const [x, y] = local(e);
    waves.throwPebble(x, y);
  }
  if (down && !down.moved && mode === "2d") {
    // A click: everything near it takes the next colour.
    const [x, y] = local(e);
    colourIndex = 2 + ((colourIndex - 1) % (PALETTE.length - 2));
    const r = 120 * (canvas.width / Math.max(1, stage.clientWidth));
    for (let i = 0; i < n; i++) {
      const dx = positions[i * 2] - x;
      const dy = positions[i * 2 + 1] - y;
      if (dx * dx + dy * dy < r * r) paint(i, PALETTE[colourIndex], 0x34);
    }
  }
  down = null;
});

function press(group: string, attr: string, value: string): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>(`#${group} button`))
    b.setAttribute("aria-pressed", String(b.dataset[attr] === value));
}
document.getElementById("modes")?.addEventListener("click", (e) => {
  const m = (e.target as HTMLElement).dataset.mode as Mode | undefined;
  if (!m || m === mode) return;
  mode = m;
  trails = null;
  press("modes", "mode", m);
  caption.textContent = CAPTIONS[m];
});
document.getElementById("seed")?.addEventListener("click", () => {
  seed = Math.random() * 1000;
  for (let i = 0; i < MAX; i++) spawn3d(i);
  trails = null; // start from a clean canvas
});
let saveNext = false;
document.getElementById("save")?.addEventListener("click", () => {
  saveNext = true;
});
document.getElementById("backends")?.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).dataset.backend as "auto" | "2d" | undefined;
  if (!b || b === backend) return;
  backend = b;
  draw.dispose();
  makeRenderer();
  press("backends", "backend", b);
});
document.getElementById("counts")?.addEventListener("click", (e) => {
  const c = Number((e.target as HTMLElement).dataset.count);
  if (!c) return;
  for (let i = n; i < c; i++) {
    spawn(i, canvas.width, canvas.height);
    paint(i, PALETTE[i % 2]); // lime and sky to start; clicks bring in the rest
  }
  n = c;
  press("counts", "count", String(c));
});

function resize(): number {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(stage.clientWidth * dpr);
  const h = Math.round(stage.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    draw.resize(w, h);
    trails = null;
  }
  return dpr;
}

let last = 0;
let fps = 60;
let work = 0;
let drawMs = 0; // waves mode: time from begin() to end(), the part spryte does
let drawn = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;
  const t0 = performance.now();
  const dpr = resize();
  const W = canvas.width;
  const H = canvas.height;
  let fresh = false;
  if (!trails || trails.width !== W || trails.height !== H) {
    if (trails) draw.disposeTarget(trails);
    trails = draw.createTarget(W, H);
    fresh = true;
  }

  if (mode === "waves" || mode === "river") {
    if (!down) camera.yaw += dt * camera.spin * 0.5;
    const scene = mode === "waves" ? waves : river;
    const count = scene.step(n, dt, now, W, H, dpr, camera, reducedMotion);
    const d0 = performance.now();
    draw.begin(BG, W / dpr, H / dpr, dpr);
    draw.push();
    draw.scale(1 / dpr);
    draw.sprites(dot, scene.positions, count, undefined, { color: scene.colors, scale: scene.scales });
    draw.pop();
    draw.end();
    drawMs += (performance.now() - d0 - drawMs) * 0.05;
    drawn = count;
    work += (performance.now() - t0 - work) * 0.05;
    report(now, dt);
    requestAnimationFrame(frame);
    return;
  }
  if (mode === "3d") step3d(dt, W, H, dpr, now);
  else step2d(dt, W, H, dpr, now);

  draw.begin(BG, W / dpr, H / dpr, dpr);
  const pts = mode === "3d" ? projected : positions;
  const each = mode === "3d" ? { color: colors3d, scale: scales } : { color: colors };
  draw.into(
    trails,
    () => {
      if (!fresh) draw.rect(0, 0, W, H, mode === "3d" ? FADE_3D : FADE);
      draw.blend("add");
      draw.sprites(dot, pts, n, undefined, each);
      draw.blend("normal");
    },
    fresh ? BG : null,
  );
  const show = (): void => draw.sprite(trails as RenderTarget, 0, 0, { origin: [0, 0], scaleX: 1 / dpr, scaleY: 1 / dpr });
  if (grain) {
    grain.set("seed", (now / 1000) % 1);
    draw.withShader(grain, show);
  } else show();
  draw.end();
  work += (performance.now() - t0 - work) * 0.05;
  report(now, dt);
  requestAnimationFrame(frame);
}

function step2d(dt: number, W: number, H: number, dpr: number, now: number): void {
  // The field: an angle at every point from a few slow, overlapping waves, so it bends and drifts.
  const t = now / 1000 + seed;
  const scale = 0.0022 / dpr;
  const speed = (reducedMotion ? 25 : 60) * dpr;
  for (const s of swirls) s.age += dt;
  while (swirls.length && (swirls[0]?.age ?? 0) > 1.5) swirls.shift();
  const swirlR = 140 * dpr;
  for (let i = 0; i < n; i++) {
    const j = i * 2;
    let x = positions[j];
    let y = positions[j + 1];
    const sx = x * scale;
    const sy = y * scale;
    const a = Math.sin(sx * 1.7 + t * 0.21) * 1.6 + Math.cos(sy * 2.3 - t * 0.17) * 1.6 + Math.sin((sx + sy) * 3.1 + seed + t * 0.11) * 1.2;
    let vx = Math.cos(a) * speed;
    let vy = Math.sin(a) * speed;
    for (const s of swirls) {
      const dx = x - s.x;
      const dy = y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < swirlR * swirlR) {
        const f = (1 - d2 / (swirlR * swirlR)) * (1 - s.age / 1.5);
        vx += (s.dx * 18 - dy * 2) * f;
        vy += (s.dy * 18 + dx * 2) * f;
      }
    }
    x += vx * dt;
    y += vy * dt;
    life[i] -= dt;
    if (life[i] <= 0 || x < 0 || y < 0 || x > W || y > H) {
      spawn(i, W, H);
    } else {
      positions[j] = x;
      positions[j + 1] = y;
    }
  }
}

function step3d(dt: number, W: number, H: number, dpr: number, now: number): void {
  // Height: three overlapping waves with phases from the seed, so "New field" makes new terrain.
  // Particles move along the contours (perpendicular to the slope), plus a little drift so they
  // cross between lines instead of circling one forever.
  const p1 = seed;
  const p2 = seed * 1.7;
  const p3 = seed * 2.3;
  const p4 = seed * 3.1;
  const drift = now / 20000;
  const speed = reducedMotion ? 0.02 : 0.045;
  if (!down) camera.yaw += dt * camera.spin;
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const size = 6; // the terrain is size x size world units
  const rise = 1.4; // world units from the lowest point to the highest
  const unit = Math.min(W, H) * 0.12; // pixels per world unit at the centre
  const eye = 10; // camera distance in world units
  for (let i = 0; i < n; i++) {
    const k = i * 2;
    let u = world[k];
    let v = world[k + 1];
    const A = TAU * 2 * u + p1;
    const B = TAU * v + p2;
    const C = TAU * (3 * u + 2 * v) + p3 + drift;
    const D = TAU * (4 * v - u) + p4;
    const sA = Math.sin(A);
    const cA = Math.cos(A);
    const sB = Math.sin(B);
    const cB = Math.cos(B);
    const sC = Math.sin(C);
    const cC = Math.cos(C);
    const sD = Math.sin(D);
    const cD = Math.cos(D);
    const h = 0.45 * sA * cB + 0.3 * sC + 0.25 * cD; // -1 to 1
    const du = TAU * (0.9 * cA * cB + 0.9 * cC + 0.25 * sD);
    const dv = TAU * (-0.45 * sA * sB + 0.6 * cC - sD);
    const g = Math.hypot(du, dv) || 1;
    u += ((-dv / g) * speed + du * 0.0004) * dt;
    v += ((du / g) * speed + dv * 0.0004) * dt;
    life[i] -= dt;
    if (life[i] <= 0 || u < 0 || v < 0 || u >= 1 || v >= 1) {
      spawn3d(i);
      u = world[k];
      v = world[k + 1];
    } else {
      world[k] = u;
      world[k + 1] = v;
    }
    // Lay the terrain flat, turn it by the camera, then project with perspective. Height is up.
    const X = (u - 0.5) * size;
    const Y = (v - 0.5) * size;
    const Z = h * rise * 0.5;
    const rx = X * cy - Y * sy;
    const ry = X * sy + Y * cy;
    const up = Z * cp - ry * sp;
    const depth = ry * cp + Z * sp; // toward the camera is positive
    const f = eye / (eye - depth);
    projected[i * 2] = W / 2 + rx * f * unit;
    projected[i * 2 + 1] = H / 2 - up * f * unit;
    scales[i] = 0.45 * f * dpr;
    const near = Math.max(0, Math.min(1, (depth + 4) / 8));
    colors3d[i] = ((RAMP[Math.min(63, Math.floor((h * 0.5 + 0.5) * 64))] << 8) | (24 + Math.round(near * 60))) >>> 0;
  }
}

function report(now: number, dt: number): void {
  if (saveNext) {
    saveNext = false;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "spryte-flow-field.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
  if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) {
    const sim = mode === "waves" ? waves.timing.sim : mode === "river" ? river.timing.sim : 0;
    const split = mode === "waves" || mode === "river" ? ` (simulate ${sim.toFixed(1)}, spryte ${drawMs.toFixed(1)})` : "";
    const count =
      mode === "waves"
        ? `${drawn.toLocaleString()} particles (${waves.side()}² surface + spray)`
        : mode === "river"
          ? `${drawn.toLocaleString()} particles (${river.census(n)}, rock)`
          : `${n.toLocaleString()} particles`;
    stats.textContent = `${count} · ${Math.round(fps)} fps · ${work.toFixed(1)} ms of JS per frame${split} · ${draw.kind} · ${draw.drawCalls} draw calls`;
  }
}

press("backends", "backend", backend);
press("counts", "count", String(n));
press("modes", "mode", mode);
caption.textContent = CAPTIONS[mode];
resize();
for (let i = 0; i < MAX; i++) {
  spawn(i, canvas.width, canvas.height);
  paint(i, PALETTE[i % 2]); // lime and sky to start; clicks bring in the rest
  spawn3d(i);
}
requestAnimationFrame(frame);
