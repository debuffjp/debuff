import type { Random } from "./random.js";

export interface CameraOptions {
  /** Viewport size in logical pixels. */
  width: number;
  height: number;
  /** World bounds the camera may not leave. Omit for unbounded. */
  bounds?: { x: number; y: number; width: number; height: number };
}

/** 2D camera with smoothed follow, deadzone and trauma-based shake.
 *  `x`/`y` is the world point at the viewport centre. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  /** Follow responsiveness in 1/s; higher snaps faster. 0 disables smoothing. */
  lerp = 8;
  /** Half-size of the region the target may move in without the camera moving. */
  deadzone = { x: 0, y: 0 };
  /** Max shake offset in pixels at trauma 1. */
  shakeAmplitude = 8;
  /** Trauma lost per second. */
  shakeDecay = 1.5;
  /** Multiplier on shake. `Game` lowers it when the player prefers reduced motion. */
  motionScale = 1;

  /**
   * Where between the previous and current simulation step to draw, in [0, 1]. `Game` sets it before
   * each render so the camera moves smoothly on displays faster than the 60 Hz simulation.
   */
  renderAlpha = 1;

  private prevX = Number.NaN;
  private prevY = Number.NaN;
  private trauma = 0;
  private offsetX = 0;
  private offsetY = 0;
  private target: { x: number; y: number } | undefined;
  /** The view size in logical units. The game keeps it equal to its own size (it changes in `scale: "expand"`). */
  width: number;
  height: number;
  bounds: CameraOptions["bounds"];

  constructor(options: CameraOptions) {
    this.width = options.width;
    this.height = options.height;
    this.bounds = options.bounds;
  }

  follow(target: { x: number; y: number } | undefined, snap = true): void {
    this.target = target;
    if (target && snap) {
      this.x = target.x;
      this.y = target.y;
      this.clamp();
      this.prevX = this.x;
      this.prevY = this.y;
    }
  }

  /** Add shake trauma in [0, 1]. Shake intensity scales with trauma². */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, random: Random): void {
    this.prevX = this.x;
    this.prevY = this.y;
    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const tx = Math.abs(dx) > this.deadzone.x ? this.target.x - Math.sign(dx) * this.deadzone.x : this.x;
      const ty = Math.abs(dy) > this.deadzone.y ? this.target.y - Math.sign(dy) * this.deadzone.y : this.y;
      const k = this.lerp > 0 ? 1 - Math.exp(-this.lerp * dt) : 1;
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
    }
    this.clamp();
    this.trauma = Math.max(0, this.trauma - this.shakeDecay * dt);
    const power = this.trauma * this.trauma * this.shakeAmplitude * this.motionScale;
    this.offsetX = power * random.range(-1, 1);
    this.offsetY = power * random.range(-1, 1);
  }

  /** The camera as an affine matrix `[a, b, c, d, e, f]` from world to viewport units.
   *  Use with `draw.withCamera(camera, () => { ... })`. The offset isn't rounded here: `Draw` snaps each sprite
   *  to whole pixels after the camera, so a followed sprite lands on `round(p - camera)` and holds still, where
   *  rounding the camera first (`round(p) - round(camera)`) made it shimmy a pixel whenever it moved. */
  view(): [number, number, number, number, number, number] {
    const z = this.zoom;
    // Before the first update there is no previous step to blend from.
    const a = Number.isNaN(this.prevX) ? 1 : this.renderAlpha;
    const x = a === 1 ? this.x : this.prevX + (this.x - this.prevX) * a;
    const y = a === 1 ? this.y : this.prevY + (this.y - this.prevY) * a;
    return [z, 0, 0, z, this.width / 2 - z * (x + this.offsetX), this.height / 2 - z * (y + this.offsetY)];
  }

  /** Convert a viewport point (e.g. pointer) to world coordinates. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.width / 2) / this.zoom + this.x,
      y: (sy - this.height / 2) / this.zoom + this.y,
    };
  }

  /** True if a world-space rectangle overlaps the view (for culling). */
  sees(x: number, y: number, w: number, h: number): boolean {
    const hw = this.width / 2 / this.zoom;
    const hh = this.height / 2 / this.zoom;
    return x + w >= this.x - hw && x <= this.x + hw && y + h >= this.y - hh && y <= this.y + hh;
  }

  private clamp(): void {
    const b = this.bounds;
    if (!b) return;
    const hw = this.width / 2 / this.zoom;
    const hh = this.height / 2 / this.zoom;
    this.x = b.width <= hw * 2 ? b.x + b.width / 2 : Math.min(Math.max(this.x, b.x + hw), b.x + b.width - hw);
    this.y = b.height <= hh * 2 ? b.y + b.height / 2 : Math.min(Math.max(this.y, b.y + hh), b.y + b.height - hh);
  }
}
