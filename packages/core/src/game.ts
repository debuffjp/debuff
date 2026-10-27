import { createRenderer, type Draw } from "spryte";
import { Camera } from "./camera.js";
import { FixedClock, type FixedClockOptions } from "./clock.js";
import { type GameErrorContext, Hooks } from "./hooks.js";
import { InspectRegistry } from "./inspect.js";
import { ParamRegistry } from "./params.js";
import { type Plugin, PluginRegistry } from "./plugin.js";
import { Random } from "./random.js";
import { debuffSans } from "./render/debuff-sans.js";
import type { Scene } from "./scene.js";
import type { drawSplash, SplashOptions } from "./splash.js";
import { FrameStats } from "./stats.js";

/** Camera shake multiplier when the player prefers reduced motion: a hint of feedback, not none. */
const REDUCED_SHAKE = 0.25;

/**
 * How the logical resolution maps onto the page:
 * - `fit`: scale to fill the container, preserving aspect ratio (letterboxed).
 * - `integer`: like `fit` but only whole-number scales, for crisp pixel art.
 * - `expand`: like `fit`, but instead of letterboxing, the logical size grows along the spare axis to fill the
 *   container. `width`/`height` are the minimum; `game.width`/`game.height` change on resize (see `hooks.resize`),
 *   so lay out from them each frame. For responsive games: portrait on phones, landscape on desktop.
 * - `pixel`: each logical unit is `pixelSize` CSS pixels (snapped to whole device pixels), and the logical size
 *   grows with the container in both directions, so a bigger window or monitor shows more of the game rather
 *   than bigger pixels. `width`/`height` are the minimum: a container too small for them at `pixelSize` scales
 *   down by whole device pixels instead. Like `expand`, lay out from `game.width`/`game.height` each frame.
 * - `none`: canvas stays at its logical size in CSS pixels.
 */
export type ScaleMode = "fit" | "integer" | "expand" | "pixel" | "none";

export interface GameOptions {
  canvas: HTMLCanvasElement;
  /** Logical resolution. Game code always works in these units. With `scale: "expand"` or `"pixel"` it's the minimum size. */
  width: number;
  height: number;
  /** Default "fit". */
  scale?: ScaleMode;
  /** CSS pixels per logical unit in `scale: "pixel"`. Default 3. */
  pixelSize?: number;
  /** Element whose size drives scaling. Default: the canvas's parent. */
  container?: HTMLElement;
  /** Nearest-neighbour sampling for crisp pixel art. Default false. */
  pixelArt?: boolean;
  /**
   * Rendering backend. `auto` (default) uses WebGL2 and falls back to Canvas 2D when it is unavailable.
   * Both implement the same `draw` API (ADR 0007).
   */
  renderer?: "auto" | "webgl2" | "2d";
  seed?: number;
  clock?: FixedClockOptions;
  /** Opaque background colour, cleared every frame. Default "#000". */
  background?: string;
  /**
   * Honour the player's reduced-motion preference. `"auto"` (default) follows
   * `prefers-reduced-motion` live; `true`/`false` force it.
   */
  reducedMotion?: "auto" | boolean;
  /**
   * A short "made with debuff" card when the game first starts, before your first frame. Any key,
   * click or tap skips it. Not shown in dev, or when time is driven by `step()` (scenarios, agents).
   * `false` removes it. Default on.
   *
   * **Publishing on Poki?** Turn it off: Poki doesn't allow splash screens. Other portals have similar rules;
   * see https://debuff.jp/docs/publishing.
   */
  splash?: boolean | SplashOptions;
}

/** Owns the loop, clock, RNG, params, camera and active scene. Renders with the
 *  standard Canvas 2D API; nothing here depends on a third-party renderer. */
export class Game {
  readonly canvas: HTMLCanvasElement;
  /** Immediate-mode drawing API, passed to `Scene.render` and render hooks. */
  readonly draw: Draw;
  /** Logical width. Fixed, except in `scale: "expand"` and `"pixel"`, where it grows to fill the container (never below the minimum). */
  get width(): number {
    return this.logicalW;
  }
  /** Logical height. Fixed, except in `scale: "expand"` and `"pixel"` (see `width`). */
  get height(): number {
    return this.logicalH;
  }
  readonly clock: FixedClock;
  readonly random: Random;
  readonly params = new ParamRegistry();
  readonly camera: Camera;
  readonly stats = new FrameStats();
  /** Typed lifecycle hooks for plugins and game code. */
  readonly hooks = new Hooks();
  /** Named JSON snapshot providers for dev tools and scenarios. */
  readonly inspect = new InspectRegistry();
  readonly scaleMode: ScaleMode;
  /** CSS pixels per logical unit in `scale: "pixel"`. */
  readonly pixelSize: number;
  readonly pixelArt: boolean;
  background: string;
  /** Multiplier on simulation dt; 0.5 = slow motion. */
  timeScale = 1;
  /**
   * True when the player prefers reduced motion. Camera shake is scaled down automatically; read this
   * to tone down your own effects (flashes, screen-wide particles, parallax speed).
   */
  get reducedMotion(): boolean {
    return this.motionReduced;
  }

  set reducedMotion(value: boolean) {
    this.motionReduced = value;
    this.camera.motionScale = value ? REDUCED_SHAKE : 1;
  }

  /** Pause automatically while the tab is hidden. */
  pauseWhenHidden = true;
  /** Current backing-store pixels per logical unit (CSS scale × devicePixelRatio). */
  renderScale = 1;

  private logicalW: number;
  private logicalH: number;
  private readonly minW: number;
  private readonly minH: number;
  private freezeTime = 0;
  private motionReduced = false;
  private motionQuery: MediaQueryList | undefined;
  private readonly onMotionChange = () => {
    this.reducedMotion = this.motionQuery?.matches ?? false;
  };
  private lastAlpha = 0;
  private readonly pluginRegistry = new PluginRegistry();
  private pendingEvents: [string, unknown][] | undefined;
  private readonly scenes = new Map<string, Scene>();
  private active: Scene | undefined;
  private frameHandle = 0;
  /** What the frame is doing right now, so a loop error can say where it came from. */
  private phase = "idle";
  private splashTotal = 0;
  private splash: typeof drawSplash | undefined;
  private splashLeft = 0;
  private readonly onSplashSkip = () => this.skipSplash();
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
    this.minW = this.logicalW = options.width;
    this.minH = this.logicalH = options.height;
    this.scaleMode = options.scale ?? "fit";
    this.pixelSize = options.pixelSize ?? 3;
    this.pixelArt = options.pixelArt ?? false;
    this.clock = new FixedClock(options.clock);
    this.random = new Random(options.seed ?? 1);
    this.background = options.background ?? "#000";
    this.draw = createRenderer(this.canvas, { backend: options.renderer ?? "auto", smooth: !this.pixelArt });
    this.draw.font = debuffSans;
    this.camera = new Camera({ width: this.width, height: this.height });
    this.camera.x = this.width / 2;
    this.camera.y = this.height / 2;
    const motion = options.reducedMotion ?? "auto";
    if (motion === "auto") {
      if (typeof matchMedia !== "undefined") {
        this.motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
        this.motionQuery.addEventListener("change", this.onMotionChange);
        this.onMotionChange();
      }
    } else {
      this.reducedMotion = motion;
    }
    this.container = options.container ?? this.canvas.parentElement;
    if (this.pixelArt) this.canvas.style.imageRendering = "pixelated";
    this.resize();
    if (typeof ResizeObserver !== "undefined" && this.container && this.scaleMode !== "none") {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.container);
    }
    if (typeof matchMedia !== "undefined") this.watchDpr();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
    const splash = options.splash ?? true;
    if (splash && !(typeof import.meta.env !== "undefined" && import.meta.env.DEV === true) && typeof addEventListener !== "undefined") {
      this.splashTotal = this.splashLeft = (splash === true ? undefined : splash.duration) ?? 1.6;
      addEventListener("keydown", this.onSplashSkip);
      // A click or tap only skips: no links out, so games are safe on portals (Poki, CrazyGames) that forbid them.
      addEventListener("pointerdown", this.onSplashSkip);
      // Loaded on demand: games that turn the splash off, and dev builds, never download it.
      import("./splash.js").then(
        (m) => {
          this.splash = m.drawSplash;
        },
        () => this.skipSplash(),
      );
    }
  }

  /** End the start-up splash now (if it is showing or pending). */
  skipSplash(): void {
    if (this.splashTotal > 0) {
    }
    this.splashTotal = this.splashLeft = 0;
    removeEventListener("keydown", this.onSplashSkip);
    removeEventListener("pointerdown", this.onSplashSkip);
  }

  /** Install a plugin. Throws if the name is invalid or already installed. */
  use(plugin: Plugin): this {
    this.pluginRegistry.install(this, plugin);
    return this;
  }

  /** Names of installed plugins, in install order. */
  get plugins(): readonly string[] {
    return this.pluginRegistry.names;
  }

  /** Stop the loop, run plugin cleanups (reverse order) and detach browser listeners. */
  dispose(): void {
    this.stop();
    this.skipSplash();
    this.pluginRegistry.dispose();
    this.motionQuery?.removeEventListener("change", this.onMotionChange);
    this.draw.dispose();
    this.observer?.disconnect();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
  }

  /** The error that stopped the loop, if any. Cleared by `start()`. */
  lastError: (GameErrorContext & { error: unknown }) | undefined;

  get scene(): Scene | undefined {
    return this.active;
  }

  get isRunning(): boolean {
    return this.running;
  }

  add(scene: Scene): this {
    if (this.scenes.has(scene.id)) throw new Error(`Scene "${scene.id}" already added`);
    this.scenes.set(scene.id, scene);
    // A game with scenes that never starts draws nothing and reports nothing; say so in dev.
    // Dev checks are written inline (not via a helper) so bundlers fold them to false and drop the code.
    if (
      typeof import.meta.env !== "undefined" &&
      import.meta.env.DEV === true &&
      this.scenes.size === 1 &&
      typeof setTimeout !== "undefined"
    ) {
      setTimeout(() => {
        // Tools that drive the game with step() never start it, but they do advance the clock.
        if (!this.wanted && this.clock.tick === 0)
          console.warn(`[debuff] Scenes were added (${this.sceneList()}) but game.start() was never called, so nothing runs.`);
      }, 2000);
    }
    return this;
  }

  private sceneList(): string {
    return [...this.scenes.keys()].join(", ") || "none";
  }

  go(id: string): void {
    const next = this.scenes.get(id);
    if (!next) throw new Error(`Unknown scene "${id}". Added: ${this.sceneList()}`);
    const previous = this.active;
    previous?.exit?.(this);
    this.active = next;
    next.enter?.(this);
    this.hooks.emit("sceneChange", next, previous);
  }

  start(): void {
    if (typeof import.meta.env !== "undefined" && import.meta.env.DEV === true && !this.active) {
      console.warn(
        this.scenes.size
          ? `[debuff] game.start() with no active scene, so only the background draws. Call game.go(id) first. Added: ${this.sceneList()}`
          : "[debuff] game.start() with no scenes. Add one with game.add({ id, update, render }) and pick it with game.go(id).",
      );
    }
    this.lastError = undefined;
    this.wanted = true;
    if (typeof document === "undefined" || !document.hidden || !this.pauseWhenHidden) this.run();
  }

  stop(): void {
    this.wanted = false;
    this.halt();
  }

  /** Advance by real elapsed seconds and render once. Exposed so tests and scenarios
   *  can drive the game without requestAnimationFrame. */
  frame(elapsed: number, draw = true): void {
    const t0 = performance.now();
    const alpha = this.clock.advance(elapsed, (dt) => {
      if (this.freezeTime > 0) {
        // Epsilon absorbs float drift so freeze(n * step) pauses exactly n steps.
        this.freezeTime = this.freezeTime - dt > 1e-9 ? this.freezeTime - dt : 0;
        return;
      }
      const scaled = dt * this.timeScale;
      this.phase = "beforeUpdate";
      this.hooks.emit("beforeUpdate", scaled);
      this.phase = "update";
      this.camera.update(scaled, this.random);
      this.active?.update?.(scaled, this);
      this.phase = "afterUpdate";
      this.hooks.emit("afterUpdate", scaled);
    });
    this.lastAlpha = alpha;
    if (!draw) return;
    this.render(alpha);
    this.stats.record(elapsed * 1000, performance.now() - t0);
  }

  /** Render the current state again without advancing time or touching frame stats (captures, editors). */
  redraw(): void {
    this.render(this.lastAlpha);
  }

  /**
   * Mark something meaningful that happened: a coin collected, a death, a level cleared. Tests, replays
   * and agents can check for it (the dev tools count events by name, e.g. `events.coin` in scenarios).
   * Costs one call per listener; nothing listens in production unless you do.
   */
  emit(name: string, detail?: unknown): void {
    // An event emitted from a listener waits until the current one has reached every listener, so all
    // listeners see events in the same order (an "achievement" never lands before the "coin" that caused it).
    if (this.pendingEvents) {
      this.pendingEvents.push([name, detail]);
      return;
    }
    const pending: [string, unknown][] = [[name, detail]];
    this.pendingEvents = pending;
    try {
      for (let i = 0; i < pending.length; i++) this.hooks.emit("gameEvent", ...(pending[i] as [string, unknown]));
    } finally {
      this.pendingEvents = undefined;
    }
  }

  /** Hit-stop: pause simulation for `seconds` (rendering continues). */
  freeze(seconds: number): void {
    this.freezeTime = Math.max(this.freezeTime, seconds);
  }

  get frozen(): boolean {
    return this.freezeTime > 0;
  }

  /**
   * Advance exactly `steps` simulation steps (deterministic; for scenarios). `draw: false` skips rendering
   * and frame stats, for fast-forwarding through a replay; call `redraw()` afterwards.
   */
  step(steps = 1, draw = true): void {
    for (let i = 0; i < steps; i++) this.frame(this.clock.step, draw);
  }

  /** Recompute CSS size and backing-store resolution. Called automatically on container
   *  resize and devicePixelRatio changes. */
  resize(): void {
    const dpr = globalThis.devicePixelRatio ?? 1;
    let css = 1;
    if (this.scaleMode !== "none" && this.container) {
      const { clientWidth: cw, clientHeight: ch } = this.container;
      if (cw > 0 && ch > 0) {
        css = Math.min(cw / this.minW, ch / this.minH);
        if (this.scaleMode === "pixel") {
          // A fixed size per logical unit in whole device pixels, unless the minimum size wouldn't fit at it.
          css = Math.max(1, Math.min(Math.round(this.pixelSize * dpr), Math.floor(css * dpr))) / dpr;
          this.setLogical(Math.max(this.minW, Math.floor(cw / css)), Math.max(this.minH, Math.floor(ch / css)));
        }
        if (this.scaleMode === "expand")
          this.setLogical(Math.max(this.minW, Math.round(cw / css)), Math.max(this.minH, Math.round(ch / css)));
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
    this.draw.resize(backingW, backingH);
    if (!this.running) this.render(0);
  }

  /** Change the logical size (expand and pixel modes): the camera follows, staying centred if it was. */
  private setLogical(w: number, h: number): void {
    if (w === this.logicalW && h === this.logicalH) return;
    const centred = this.camera.x === this.logicalW / 2 && this.camera.y === this.logicalH / 2;
    this.logicalW = w;
    this.logicalH = h;
    this.camera.width = w;
    this.camera.height = h;
    if (centred) {
      this.camera.x = w / 2;
      this.camera.y = h / 2;
    }
    this.hooks.emit("resize", w, h);
  }

  /** Convert client (event) coordinates to logical game coordinates. Bound, so it can be passed around (e.g. to `Input`). */
  readonly toLogical = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.width,
      y: ((clientY - rect.top) / rect.height) * this.height,
    };
  };

  private run(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const elapsed = (now - this.lastTime) / 1000;
      if (this.splashLeft > 0) {
        // The splash holds the game's first frame; time starts when it ends.
        this.splashLeft = Math.max(0, this.splashLeft - Math.min(elapsed, 0.1));
        if (this.splashLeft === 0) this.skipSplash();
        this.draw.begin("#000", this.width, this.height, this.renderScale);
        try {
          this.splash?.(this.draw, this.width, this.height, 1 - this.splashLeft / (this.splashTotal || 1), this.reducedMotion);
        } catch {
          this.skipSplash(); // never let branding break a game
        }
        this.draw.end();
      } else {
        try {
          this.frame(elapsed);
        } catch (error) {
          // Stop cleanly instead of freezing with a dead loop that still claims to run, tell listeners
          // (the dev overlay shows where it broke), then rethrow so the console reports it as usual.
          this.stop();
          const context = { phase: this.phase, scene: this.active?.id, tick: this.clock.tick };
          this.lastError = { error, ...context };
          this.phase = "idle";
          this.draw.reset();
          this.hooks.emit("error", error, context);
          throw error;
        }
      }
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
    const { draw } = this;
    this.camera.renderAlpha = alpha;
    draw.begin(this.background, this.width, this.height, this.renderScale);
    let render = () => {
      this.phase = "beforeRender";
      this.hooks.emit("beforeRender", draw, alpha);
      this.phase = "render";
      this.active?.render?.(draw, alpha, this);
    };
    for (const wrap of this.hooks.list("renderScene")) {
      const inner = render;
      render = () => wrap(draw, inner);
    }
    this.phase = "renderScene";
    render();
    // afterRender always starts from a clean transform, whatever the scene left behind.
    draw.reset();
    this.phase = "afterRender";
    this.hooks.emit("afterRender", draw, alpha);
    draw.end();
    this.phase = "idle";
  }
}
