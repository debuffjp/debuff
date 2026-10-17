import type { DrawLike } from "./draw-like.js";

export interface TransitionOptions {
  /** Seconds to fade out, and again to fade back in. Default 0.35. */
  duration?: number;
  /** Cover colour. Default black. */
  color?: string | number;
}

/**
 * A fade-out → swap → fade-in screen transition. `run(swap)` covers the screen, calls `swap` once
 * fully covered (move the player, load the level, change scene), then uncovers it. Driven by
 * `update(dt)`, so it stays deterministic under replays and scenarios.
 *
 * ```ts
 * const fade = new Transition({ color: "#1a1020" });
 * fade.run(() => placePlayer(stairs));
 * // every step: fade.update(dt); if (fade.blocking) return;
 * // after drawing the world: fade.draw(draw, 0, 0, game.width, game.height);
 * ```
 */
export class Transition {
  duration: number;
  color: string | number;
  private t = -1;
  private swap: (() => void) | undefined;

  constructor(options: TransitionOptions = {}) {
    this.duration = options.duration ?? 0.35;
    this.color = options.color ?? "#000";
  }

  /** Start a transition. Ignored while one is already running, so a held button can't stack them. */
  run(swap?: () => void): boolean {
    if (this.active) return false;
    this.t = 0;
    this.swap = swap;
    return true;
  }

  /** Cancel without calling the pending swap, e.g. on a full reset. */
  stop(): void {
    this.t = -1;
    this.swap = undefined;
  }

  /** A transition is running. */
  get active(): boolean {
    return this.t >= 0;
  }

  /** Still covering or swapping: gameplay usually pauses until the fade-in starts. */
  get blocking(): boolean {
    return this.t >= 0 && this.t < 1;
  }

  /** How covered the screen is, 0 to 1. */
  get cover(): number {
    if (this.t < 0) return 0;
    return this.t < 1 ? this.t : Math.max(0, 2 - this.t);
  }

  update(dt: number): void {
    if (this.t < 0) return;
    const before = this.t;
    this.t += dt / Math.max(this.duration, 1e-6);
    if (before < 1 && this.t >= 1) {
      const swap = this.swap;
      this.swap = undefined;
      swap?.();
    }
    if (this.t >= 2) this.t = -1;
  }

  /** Draw the cover over a region (usually the whole screen, or the play area below a HUD). */
  draw(draw: DrawLike, x: number, y: number, w: number, h: number): void {
    const a = this.cover;
    if (a <= 0) return;
    const prev = draw.alpha;
    draw.alpha = prev * a;
    draw.rect(x, y, w, h, this.color);
    draw.alpha = prev;
  }

  inspect(): { active: boolean; cover: number } {
    return { active: this.active, cover: this.cover };
  }
}
