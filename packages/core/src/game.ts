import { FixedClock, type FixedClockOptions } from "./clock.js";
import { ParamRegistry } from "./params.js";
import { Random } from "./random.js";
import type { Scene } from "./scene.js";

export interface GameOptions {
  canvas: HTMLCanvasElement;
  /** Logical resolution; the canvas backing store is scaled by devicePixelRatio. */
  width: number;
  height: number;
  seed?: number;
  clock?: FixedClockOptions;
  /** Background clear colour. Default "#000". */
  background?: string;
}

/** Owns the loop, clock, RNG, params and the active scene. Rendering is Canvas 2D
 *  for now; the renderer choice (Canvas vs PixiJS) is still open. */
export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly clock: FixedClock;
  readonly random: Random;
  readonly params = new ParamRegistry();
  background: string;

  private readonly scenes = new Map<string, Scene>();
  private active: Scene | undefined;
  private frameHandle = 0;
  private lastTime = 0;
  private running = false;

  constructor(options: GameOptions) {
    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.clock = new FixedClock(options.clock);
    this.random = new Random(options.seed ?? 1);
    this.background = options.background ?? "#000";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
    this.resize();
  }

  get scene(): Scene | undefined {
    return this.active;
  }

  add(scene: Scene): this {
    if (this.scenes.has(scene.id)) throw new Error(`Scene "${scene.id}" already added`);
    this.scenes.set(scene.id, scene);
    return this;
  }

  go(id: string): void {
    const next = this.scenes.get(id);
    if (!next) throw new Error(`Unknown scene "${id}"`);
    this.active?.exit?.(this);
    this.active = next;
    next.enter?.(this);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame((now - this.lastTime) / 1000);
      this.lastTime = now;
      this.frameHandle = requestAnimationFrame(loop);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  /** Advance by real elapsed seconds and render once. Exposed so tests and scenarios
   *  can drive the game without requestAnimationFrame. */
  frame(elapsed: number): void {
    const alpha = this.clock.advance(elapsed, (dt) => this.active?.update?.(dt, this));
    this.render(alpha);
  }

  /** Advance exactly `steps` simulation steps (deterministic; for scenarios). */
  step(steps = 1): void {
    for (let i = 0; i < steps; i++) this.frame(this.clock.step);
  }

  resize(): void {
    const dpr = globalThis.devicePixelRatio ?? 1;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private render(alpha: number): void {
    const { ctx } = this;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.active?.render?.(ctx, alpha, this);
  }
}
