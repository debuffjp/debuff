// Bunnymark: N textured sprites bouncing under gravity. Same simulation for every renderer;
// only the drawing differs. Controlled by ?renderer=canvas2d|debuff-webgl|pixi-sprite|pixi-particle
import { WebGLBatcher } from "./webgl-batcher.js";

const WIDTH = 960;
const HEIGHT = 540;
const SIZE = 16;

interface Bunny {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const params = new URLSearchParams(location.search);
const renderer = params.get("renderer") ?? "canvas2d";
const canvas = document.querySelector("canvas") as HTMLCanvasElement;
canvas.width = WIDTH;
canvas.height = HEIGHT;

// Deterministic simulation so every renderer draws identical scenes.
let seed = 1;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const bunnies: Bunny[] = [];
const spawn = (n: number) => {
  for (let i = 0; i < n; i++) bunnies.push({ x: rand() * WIDTH, y: rand() * HEIGHT * 0.5, vx: rand() * 10 - 5, vy: rand() * 10 - 5 });
};
const step = () => {
  for (const b of bunnies) {
    b.x += b.vx;
    b.y += b.vy;
    b.vy += 0.75;
    if (b.x > WIDTH || b.x < 0) b.vx = -b.vx;
    if (b.y > HEIGHT) {
      b.vy *= -0.85;
      b.y = HEIGHT;
    } else if (b.y < 0) {
      b.vy = 0;
      b.y = 0;
    }
  }
};

function makeTexture(): HTMLCanvasElement {
  const t = document.createElement("canvas");
  t.width = t.height = SIZE;
  const ctx = t.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#a3e635";
  ctx.fillRect(2, 2, SIZE - 4, SIZE - 4);
  ctx.fillStyle = "#11140d";
  ctx.fillRect(5, 5, 2, 2);
  ctx.fillRect(9, 5, 2, 2);
  return t;
}

type Draw = () => void;

async function setup(): Promise<{ draw: Draw; sync: () => void | Promise<void> }> {
  const texture = makeTexture();
  if (renderer === "canvas2d") {
    const ctx = canvas.getContext("2d", { alpha: false }) as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;
    return {
      draw: () => {
        ctx.fillStyle = "#11140d";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        for (const b of bunnies) ctx.drawImage(texture, b.x - SIZE / 2, b.y - SIZE / 2);
      },
      // getImageData would move the canvas to the CPU; createImageBitmap flushes while staying on the GPU.
      sync: () => createImageBitmap(canvas).then((bitmap) => bitmap.close()),
    };
  }
  if (renderer === "debuff-webgl") {
    const batcher = new WebGLBatcher(canvas);
    const tex = batcher.createTexture(texture);
    return {
      draw: () => {
        batcher.begin(WIDTH, HEIGHT, [0.067, 0.078, 0.051]);
        for (const b of bunnies) batcher.draw(tex, b.x, b.y, SIZE, SIZE);
        batcher.flush();
      },
      sync: () => readPixel(batcher.gl),
    };
  }
  // PixiJS v8, the most widely used web 2D renderer, with its standard and particle paths.
  const PIXI = await import("pixi.js");
  const app = new PIXI.Application();
  await app.init({ canvas, width: WIDTH, height: HEIGHT, background: "#11140d", preference: "webgl", antialias: false, autoStart: false });
  const tex = PIXI.Texture.from(texture);
  tex.source.scaleMode = "nearest";
  if (renderer === "pixi-particle") {
    const container = new PIXI.ParticleContainer({ dynamicProperties: { position: true } });
    app.stage.addChild(container);
    const particles: InstanceType<typeof PIXI.Particle>[] = [];
    return {
      draw: () => {
        for (let i = 0; i < bunnies.length; i++) {
          let p = particles[i];
          if (!p) {
            p = new PIXI.Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
            particles.push(p);
            container.addParticle(p);
          }
          const b = bunnies[i] as Bunny;
          p.x = b.x;
          p.y = b.y;
        }
        app.render();
      },
      sync: () => readPixel((app.renderer as unknown as { gl: WebGL2RenderingContext }).gl),
    };
  }
  const sprites: InstanceType<typeof PIXI.Sprite>[] = [];
  return {
    draw: () => {
      for (let i = 0; i < bunnies.length; i++) {
        let s = sprites[i];
        if (!s) {
          s = new PIXI.Sprite(tex);
          s.anchor.set(0.5);
          sprites.push(s);
          app.stage.addChild(s);
        }
        const b = bunnies[i] as Bunny;
        s.x = b.x;
        s.y = b.y;
      }
      app.render();
    },
    sync: () => readPixel((app.renderer as unknown as { gl: WebGL2RenderingContext }).gl),
  };
}

const pixel = new Uint8Array(4);
/** Force the GPU to finish the frame so its cost is included in the measurement. */
function readPixel(gl: WebGL2RenderingContext): void {
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
}

const { draw, sync } = await setup();

/**
 * Render `frames` frames back-to-back at `count` sprites. Each frame is timed from simulation
 * through GPU completion (forced by a 1-pixel readback), so vsync and rAF pacing don't mask cost.
 * `frameMs` is full CPU+GPU cost; `submitMs` is main-thread time before the readback.
 */
async function measure(count: number, frames = 100): Promise<{ count: number; frameMs: number; p95FrameMs: number; submitMs: number }> {
  if (bunnies.length < count) spawn(count - bunnies.length);
  bunnies.length = count;
  // Warm up: JIT, texture upload, buffer growth.
  for (let i = 0; i < 20; i++) {
    step();
    draw();
    await sync();
  }
  await new Promise(requestAnimationFrame);
  const total: number[] = [];
  const submit: number[] = [];
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    step();
    draw();
    const t1 = performance.now();
    await sync();
    total.push(performance.now() - t0);
    submit.push(t1 - t0);
  }
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
  const at = (xs: number[], q: number) => sorted(xs)[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? 0;
  return { count, frameMs: at(total, 0.5), p95FrameMs: at(total, 0.95), submitMs: at(submit, 0.5) };
}

(window as unknown as { __bench: unknown }).__bench = { renderer, measure, ready: true };
