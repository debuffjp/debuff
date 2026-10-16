import { Camera } from "./camera.js";
import { FixedClock, type FixedClockOptions } from "./clock.js";
import { ParamRegistry } from "./params.js";
import { Random } from "./random.js";
import type { Scene } from "./scene.js";
import { FrameStats } from "./stats.js";

/**
 * How the logical resolution maps onto the page:
 * - `fit`: scale to fill the container, preserving aspect ratio (letterboxed).
 * - `integer`: like `fit` but only whole-number scales, for crisp pixel art.
 * - `none`: canvas stays at its logical size in CSS pixels.
 */
export type ScaleMode = "fit" | "integer" | "none";

export interface GameOptions {
  canvas: HTMLCanvasElement;
  /** Logical resolution. Game code always works in these units. */
  width: number;
  height: number;
  /** Default "fit". */
  scale?: ScaleMode;
  /** Element whose size drives scaling. Default: the canvas's parent. */
  container?: HTMLElement;
  /** Disable image smoothing for nearest-neighbour pixel art. Default false. */
  pixelArt?: boolean;
  seed?: number;
  clock?: FixedClockOptions;
  /** Opaque background colour, cleared every frame. Default "#000". */
  background?: string;
}

/** Owns the loop, clock, RNG, params, camera and active scene. Renders with the
 *  standard Canvas 2D API; nothing here depends on a third-party renderer. */
export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly clock: FixedClock;
  readonly random: Random;
  readonly params = new ParamRegistry();
  readonly camera: Camera;
  readonly stats = new FrameStats();
  readonly scaleMode: ScaleMode;
  readonly pixelArt: boolean;
  background: string;
  /** Multiplier on simulation dt; 0.5 = slow motion. */
  timeScale = 1;
  /** Pause automatically while the tab is hidden. */
  pauseWhenHidden = true;
  /** Current backing-store pixels per logical unit (CSS scale × devicePixelRatio). */
  renderScale = 1;

  private freezeTime = 0;
  private readonly postUpdate = new Set<(dt: number) => void>();
  private readonly scenes = new Map<string, Scene>();
  private active: Scene | undefined;
  private frameHandle = 0;
  private lastTime = 0;
  private running = false;
  /** Whether the caller wants the loop running; visibility pausing respects this. */
  private wanted = false;
  private observer: ResizeObserver | undefined;
  private readonly container: HTMLElement | null;
  private readonly onVisibility = () => {
    if (!this.pauseWhenHidden || !this.wanted) return;
    if (document.hidden) this.halt();
    else this.run();
  };

  constructor(options: GameOptions) {
    this.canvas = options.canvas;
    this.width = options.width;
    this.height = options.height;
    this.scaleMode = options.scale ?? "fit";
    this.pixelArt = options.pixelArt ?? false;
    this.clock = new FixedClock(options.clock);
    this.random = new Random(options.seed ?? 1);
    this.background = options.background ?? "#000";
    // alpha:false lets the compositor skip blending; desynchronized lowers input latency where supported.
    const ctx = this.canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
    this.camera = new Camera({ width: this.width, height: this.height });
    this.camera.x = this.width / 2;
    this.camera.y = this.height / 2;
    this.container = options.container ?? this.canvas.parentElement;
    if (this.pixelArt) this.canvas.style.imageRendering = "pixelated";
    this.resize();
    if (typeof ResizeObserver !== "undefined" && this.container && this.scaleMode !== "none") {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.container);
    }
    if (typeof matchMedia !== "undefined") this.watchDpr();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Stop the loop and detach browser listeners. */
  dispose(): void {
    this.stop();
    this.observer?.disconnect();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
  }

  get scene(): Scene | undefined {
    return this.active;
  }

  get isRunning(): boolean {
    return this.running;
  }

  add(scene: Scene): this {
    if (this.scenes.has(scene.id)) throw new Error(`Scene "${scene.id}" already added`);
    this.scenes.set(scene.id, scene);
    return this;
  }

  go(id: string): void {
    const next = this.scenes.get(id);
    if (!next) throw new Error(`Unknown scene "${id}". Added: ${[...this.scenes.keys()].join(", ") || "none"}`);
    this.active?.exit?.(this);
    this.active = next;
    next.enter?.(this);
  }

  start(): void {
    this.wanted = true;
    if (typeof document === "undefined" || !document.hidden || !this.pauseWhenHidden) this.run();
  }

  stop(): void {
    this.wanted = false;
    this.halt();
  }

  /** Advance by real elapsed seconds and render once. Exposed so tests and scenarios
   *  can drive the game without requestAnimationFrame. */
  frame(elapsed: number): void {
    const t0 = performance.now();
    const alpha = this.clock.advance(elapsed, (dt) => {
      if (this.freezeTime > 0) {
        // Epsilon absorbs float drift so freeze(n * step) pauses exactly n steps.
        this.freezeTime = this.freezeTime - dt > 1e-9 ? this.freezeTime - dt : 0;
        return;
      }
      const scaled = dt * this.timeScale;
      this.camera.update(scaled, this.random);
      this.active?.update?.(scaled, this);
      for (const hook of this.postUpdate) hook(scaled);
    });
    this.render(alpha);
    this.stats.record(elapsed * 1000, performance.now() - t0);
  }

  /** Hit-stop: pause simulation for `seconds` (rendering continues). */
  freeze(seconds: number): void {
    this.freezeTime = Math.max(this.freezeTime, seconds);
  }

  get frozen(): boolean {
    return this.freezeTime > 0;
  }

  /** Run after every scene update, e.g. to clear input edges. Returns an unsubscribe. */
  afterUpdate(hook: (dt: number) => void): () => void {
    this.postUpdate.add(hook);
    return () => this.postUpdate.delete(hook);
  }

  /** Advance exactly `steps` simulation steps (deterministic; for scenarios). */
  step(steps = 1): void {
    for (let i = 0; i < steps; i++) this.frame(this.clock.step);
  }

  /** Recompute CSS size and backing-store resolution. Called automatically on container
   *  resize and devicePixelRatio changes. */
  resize(): void {
    const dpr = globalThis.devicePixelRatio ?? 1;
    let css = 1;
    if (this.scaleMode !== "none" && this.container) {
      const { clientWidth: cw, clientHeight: ch } = this.container;
      if (cw > 0 && ch > 0) {
        css = Math.min(cw / this.width, ch / this.height);
        // Integer mode snaps in device pixels so each logical pixel maps to whole device pixels.
        if (this.scaleMode === "integer") css = Math.max(1, Math.floor(css * dpr)) / dpr;
      }
    }
    const cssW = Math.round(this.width * css);
    const cssH = Math.round(this.height * css);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const backingW = Math.max(1, Math.round(cssW * dpr));
    const backingH = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
    }
    this.renderScale = backingW / this.width;
    // Resizing resets context state, so reapply.
    this.ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
    this.ctx.imageSmoothingEnabled = !this.pixelArt;
    if (!this.running) this.render(0);
  }

  /** Convert client (event) coordinates to logical game coordinates. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.width,
      y: ((clientY - rect.top) / rect.height) * this.height,
    };
  }

  private run(): void {
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

  private halt(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  /** devicePixelRatio changes (zoom, moving between monitors) don't fire resize on the container. */
  private watchDpr(): void {
    const query = matchMedia(`(resolution: ${globalThis.devicePixelRatio ?? 1}dppx)`);
    query.addEventListener(
      "change",
      () => {
        this.resize();
        this.watchDpr();
      },
      { once: true },
    );
  }

  private render(alpha: number): void {
    const { ctx } = this;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.active?.render?.(ctx, alpha, this);
  }
}
